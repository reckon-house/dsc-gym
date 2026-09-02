// Owner chat endpoint. Persistent thread per active DraftSchedule.
// LLM uses Anthropic tool-use; the only way it interacts with schedule
// state is through SCHEDULING_TOOLS / dispatchTool — which goes through
// the engine.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { getOrCreateActiveDraft } from '@/lib/scheduling/engine'
import { SCHEDULING_TOOLS, dispatchTool } from '@/lib/scheduling/tools'

// Sonnet handles the scheduler chat well — tool use + multi-step
// orchestration, not deep reasoning. The engine is the authority, so
// the model isn't load-bearing. CLAUDE_MODEL env var lets us flip back
// to Opus or any other model without a deploy.
// Vercel function timeout. Default on Pro is 60s; max is 300s. Bulk
// scheduling can need a lot of round-trips, so we ask Vercel for the
// full ceiling. The wall-clock guard below stops us before Vercel
// would kill the function uncleanly.
export const maxDuration = 300

const MODEL_ID = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
// A real bulk request (e.g. "book these 12 sessions for me") can fan
// out to 30+ tool calls — each item is at minimum check_availability +
// propose_booking, plus athlete/trainer lookups and the occasional
// add_athlete. 50 is comfortably above any realistic bulk and the
// time guard below kicks in first anyway.
// Bounds a runaway tool loop. 50 was high enough to be no bound at all — a
// model stuck re-listing the same week could make 50 paid calls before the
// wall clock intervened. A real scheduling turn is 2-6 rounds.
const MAX_TOOL_ROUNDS = 12

// Stop looping ~20s before Vercel's hard kill so we have time to ask
// the model for a clean wrap-up summary instead of dying mid-loop.
const WALL_CLOCK_BUDGET_MS = 280_000

interface StoredMessage {
  role: 'user' | 'assistant'
  content: Anthropic.Messages.ContentBlockParam[]
}

function getAnthropic(): Anthropic {
  const apiKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('CLAUDE_KEY not configured')
  return new Anthropic({ apiKey })
}

async function loadStaticContext(gymId: string): Promise<string> {
  const [gym, config, trainers] = await Promise.all([
    db.gym.findUnique({ where: { id: gymId } }),
    db.gymConfig.findUnique({ where: { gymId } }),
    db.trainer.findMany({
      where: { gymId, archived: false },
      include: {
        user: { select: { name: true, email: true } },
        availability: true,
      },
    }),
  ])
  if (!gym || !config) throw new Error('Gym or config missing')

  // Active groups, so the model can resolve "the basketball group" without a
  // lookup round-trip. Rides in the cached prefix with the rest of this block.
  const groups = await db.group.findMany({
    where: { gymId, active: true },
    include: {
      members: { select: { athleteId: true } },
      coaches: { include: { trainer: { select: { user: { select: { name: true } } } } } },
    },
    orderBy: { name: 'asc' },
  })
  const groupLines = groups.map((g) => {
    const when =
      g.dayOfWeek !== null && g.startMinute !== null
        ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][g.dayOfWeek]} ${fmtMinute(g.startMinute)} (${g.duration}min)`
        : 'no weekly time'
    const coaches = g.coaches.map((c) => c.trainer.user.name).join(' & ') || 'no coaches'
    const open = g.openForSignup
      ? `, OPEN for signups${g.capacity !== null ? ` (${g.members.length}/${g.capacity})` : ''}`
      : ''
    return `- ${g.name} (id: ${g.id}): ${when}, ${g.members.length} members, coached by ${coaches}${open}`
  })

  // Surfaced in the cached prefix so the owner can just ask "anyone waiting?"
  const pendingClassRequests = await db.groupJoinRequest.count({
    where: { gymId, status: 'pending' },
  })

  const trainerLines = trainers.map((t) => {
    const days = t.availability
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((a) => {
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.dayOfWeek]
        return `${dayName} ${fmtMinute(a.startMinute)}-${fmtMinute(a.endMinute)}`
      })
      .join(', ') || 'no availability set yet'
    return `- ${t.user.name} (id: ${t.id}): ${days}`
  })

  return `# Gym
${gym.name} (timezone: ${gym.timezone})

# Booking rules (configurable)
- Floor cap: ${config.floorCap} concurrent sessions max
- Allowed session lengths: ${config.sessionLengthsJson} minutes
- Buffer between trainer's sessions: ${config.bufferMinutes} min
- Same trainer same day allowed: ${config.allowSameTrainerSameDay}
- Default session length: ${config.defaultSessionMinutes} min
- Cancellation policy: ${config.cancellationPolicyHours} hours notice
- No-show policy: ${config.noShowPolicy}

# Trainers
${trainerLines.join('\n')}

# Groups
${groupLines.length ? groupLines.join('\n') : '- none yet'}
${pendingClassRequests > 0 ? `\n# Waiting\n- ${pendingClassRequests} family request(s) for a spot in an open class. Call list_class_requests for details.` : ''}`
}

function fmtMinute(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  const ampm = h < 12 ? 'am' : 'pm'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(min).padStart(2, '0')}${ampm}`
}

const SYSTEM_INSTRUCTIONS = `You are the scheduling assistant for a small personal-training gym. You help the owner (Jordan) manage the weekly schedule by chatting in natural language.

# The one rule you must follow
You are not the authority on the schedule. The engine is. Every booking decision goes through the tools — you cannot decide availability from your head. Call the tools and report what they return.

# How you work
- When the owner asks about state ("who is Sarah seeing Thursday?", "is the floor open at 10?"), call the read tools and answer plainly.
- When the owner wants to schedule, MOVE, or CANCEL something: do NOT write to the schedule directly. Call propose_booking / propose_move / propose_cancel. These add to a draft. The owner must explicitly confirm before you commit.
- ALWAYS call check_availability before propose_booking. If there's a conflict, surface it in plain English and suggest alternatives.
- When the owner says "yes", "looks good", "do it", "commit", or similar — call commit_all_pending (or commit_one if they referenced a specific item).
- When the owner says "scrap that", "undo", "start over" — call discard_draft.
- If the owner says something ambiguous (Sarah said "morning" — 8am or 10am?), ask. Don't guess.

# Tone
Plain, short, friendly. Jordan is a gym owner, not a computer person. Don't use jargon. Don't dump JSON. When you describe times, use "9am" not "09:00:00".

# Today
The current date/time will be in the user message context.

# Groups
A group is a named, recurring cohort — "the basketball group, Mondays at 11am".
- create_group makes the group and its roster. It books NOTHING. Say so, then
  ask whether to put it on the calendar.
- materialize_group is what actually creates sessions. Treat it like a commit:
  only call it after the owner says yes, and read back what it created and
  skipped ("8 weeks booked, 1 skipped — Scott's already got that hour").
- update_group changes rosters. Adding someone ALSO puts them into the group's
  upcoming sessions, and removing someone takes them out — so don't tell the
  owner a roster change is future-only.
- A group can have several coaches. The first is the lead and shows on the
  calendar; every coach is checked for double-booking.

# Recording something that already happened
The schedule is also a record, not only a plan. When the owner says "add last
Tuesday's session", "log the class we ran Saturday" or similar, pass
allowPast: true on propose_booking. Without it the engine refuses the date and
the owner cannot enter attendance they already have on paper.
Never set allowPast to work around a date you got wrong — if a time looks
mistaken, ask.

# Adding someone to a session that already exists
This is its own thing, and getting it wrong is the single most confusing
failure in the app. If an athlete should join a class that is ALREADY on the
calendar:
- call add_athlete_to_session with that session's id. Get the id from
  list_sessions.
- do NOT call propose_booking / propose_batch. Those create a SECOND session at
  the same time, which collides with the one already there, and the owner sees
  "<coach> is already with <athlete>" — which reads as "that time isn't
  available" even though the class they are trying to join is right there.
- adding to a session is immediate and needs no draft or commit. It is not a
  new booking; it is one more person in a class that is already happening.

Choosing between the two roster tools:
- update_group (addAthleteIds) = they attend this group EVERY week from now on.
- add_athlete_to_session = they attend THIS ONE session.
So "he comes Mondays and Wednesdays but not the other days" is handled by
putting him in the Monday and Wednesday groups — not by adding him to the
five-day group and then removing days. And "she is trying it out this Thursday"
is add_athlete_to_session, once.

# Open classes
A group can be marked openForSignup. That makes it visible on families'
schedules even with an EMPTY roster, and they can ask for a spot. This is how
the owner advertises a class before anyone has joined — the answer to "I can't
build a group without athletes yet".
- When the owner describes a class they want to fill ("start a Tuesday guards
  group and let people sign up"), create it with openForSignup: true, and set
  capacity if they mention a limit.
- An open group with nobody in it is normal and correct. Do not warn about it.
- list_class_requests shows families waiting. approve_class_request adds them
  to the roster AND their upcoming sessions; decline_class_request emails the
  reason you pass, so write it for a parent to read.
- Approving is not a draft — it takes effect immediately. Confirm with the
  owner before approving or declining unless they already said which.

# Announcements (email blasts)
You can email groups of athletes. You NEVER send without an explicit yes.
- "Email everyone the gym is closed Monday" is a request to DRAFT. Call
  draft_email_blast, then read back in plain English: who it goes to, how many
  people, the subject and the body. Mention anyone excluded — e.g. "2 kids have
  no birthday on file so the age filter skips them".
- Only after the owner confirms THAT read-back do you call send_email_blast.
- "Never mind" / "scrap it" -> discard_email_blast.
- Never invent recipients. The tool computes the audience; you report it.`

// Helper for building SSE event chunks. Each event is two newlines apart
// per the protocol. JSON payload keeps things easy on the client.
function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Put a cache breakpoint on the last content block of the last message.
 *
 * Returns a shallow copy — the in-memory `messages` array is appended to
 * across tool rounds and must not carry stale cache markers forward.
 */
function withCachedHistory(
  msgs: Anthropic.Messages.MessageParam[]
): Anthropic.Messages.MessageParam[] {
  if (msgs.length === 0) return msgs
  const out = msgs.slice()
  const last = out[out.length - 1]
  const content = Array.isArray(last.content)
    ? last.content
    : [{ type: 'text' as const, text: String(last.content) }]
  if (content.length === 0) return msgs
  const blocks = content.slice()
  blocks[blocks.length - 1] = {
    ...(blocks[blocks.length - 1] as Anthropic.Messages.ContentBlockParam),
    cache_control: { type: 'ephemeral' },
  } as Anthropic.Messages.ContentBlockParam
  out[out.length - 1] = { ...last, content: blocks }
  return out
}

export async function POST(request: NextRequest) {
  // Auth + setup happens synchronously before we open the stream so we
  // can return a plain JSON error if something is wrong with the request
  // itself (rather than streaming an error).
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: string; reset?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const userMessage: string = body.message ?? ''
  const reset: boolean = !!body.reset
  if (!userMessage.trim() && !reset) {
    return NextResponse.json({ success: false, error: 'Empty message' }, { status: 400 })
  }

  const gymId = DEFAULT_GYM_ID

  // Reset path: discard any active draft so a fresh one is created.
  if (reset) {
    await db.draftSchedule.updateMany({
      where: { gymId, status: 'active', createdById: session.userId },
      data: { status: 'discarded' },
    })
  }

  const draftId = await getOrCreateActiveDraft(gymId, session.userId)

  // Persist the user message immediately so even a stream-abort leaves
  // a coherent transcript behind.
  if (userMessage.trim()) {
    await db.chatMessage.create({
      data: { draftId, role: 'user', content: userMessage },
    })
  }

  // Load thread history into the Anthropic message format.
  const history = await db.chatMessage.findMany({
    where: { draftId },
    orderBy: { createdAt: 'asc' },
  })
  const messages: StoredMessage[] = []
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: [{ type: 'text', text: m.content }] })
    } else if (m.role === 'assistant') {
      const stored = (m.toolCalls as Anthropic.Messages.ContentBlockParam[] | null) ?? null
      if (stored) {
        messages.push({ role: 'assistant', content: stored })
      } else if (m.content) {
        messages.push({ role: 'assistant', content: [{ type: 'text', text: m.content }] })
      }
    } else if (m.role === 'tool_result') {
      const stored = (m.toolCalls as Anthropic.Messages.ContentBlockParam[] | null) ?? null
      if (stored) messages.push({ role: 'user', content: stored })
    }
  }

  const staticContext = await loadStaticContext(gymId)
  const dynamicContext = `Current date/time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (America/Chicago)`

  const anthropic = getAnthropic()

  // The stream. Each LLM round opens an anthropic.messages.stream(),
  // pipes text/tool deltas as SSE events, then runs the tool calls
  // before looping into the next round. Final 'done' event signals
  // the client to refresh proposals + draftId.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseChunk(event, data)))
      }
      // SSE comment line — clients ignore them per spec, but the bytes
      // flush the response buffer. Used both as initial padding (defeat
      // Vercel/Node ~8KB chunk batching so the first text_delta lands
      // immediately) and as keep-alives between long-running tool
      // dispatches so the connection stays live.
      const ping = () => {
        controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`))
      }

      // 2KB padding upfront — flushes past any small-chunk buffering
      // and forces the client's first read() to fire immediately.
      controller.enqueue(
        encoder.encode(`: ${'-'.repeat(2048)}\n\n`)
      )

      const startedAt = Date.now()
      let stopReason: string | null = null
      let round = 0

      // Periodic heartbeat for very long tool dispatches — fires every
      // 3s independent of the main loop so even a quiet stretch keeps
      // the connection warm.
      const heartbeat = setInterval(() => {
        try {
          ping()
        } catch {
          /* controller may be closed; ignore */
        }
      }, 3000)

      try {
        while (round < MAX_TOOL_ROUNDS) {
          // Wall-clock guard.
          if (Date.now() - startedAt > WALL_CLOCK_BUDGET_MS) {
            console.warn(
              `[chat] wall-clock budget hit at round ${round} (${Date.now() - startedAt}ms) — wrapping up`
            )
            stopReason = 'tool_use'
            break
          }
          round++

          send('round_start', { round })

          const llmStream = anthropic.messages.stream({
            model: MODEL_ID,
            max_tokens: 4096,
            system: [
              {
                type: 'text',
                text: SYSTEM_INSTRUCTIONS,
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'text',
                text: staticContext,
                cache_control: { type: 'ephemeral' },
              },
              { type: 'text', text: dynamicContext },
            ],
            tools: SCHEDULING_TOOLS,
            // Cache the conversation too, not just the static prefix. Each
            // turn's history is a strict prefix of the next turn's, so marking
            // the final message lets the API serve everything before it from
            // cache at a tenth of the input price. Without this a long thread
            // re-bills its whole history every message — a live draft was
            // replaying ~37k tokens per turn, growing with every exchange.
            messages: withCachedHistory(messages as Anthropic.Messages.MessageParam[]),
          })

          // Pipe stream events to the client. Text deltas land as
          // `text_delta`; tool_use block starts land as `tool_use_start`
          // (so the UI can show "calling list_athletes…" before the
          // result lands).
          for await (const ev of llmStream) {
            if (ev.type === 'content_block_start') {
              if (ev.content_block.type === 'tool_use') {
                send('tool_use_start', {
                  id: ev.content_block.id,
                  name: ev.content_block.name,
                  index: ev.index,
                })
              }
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta.type === 'text_delta') {
                send('text_delta', { text: ev.delta.text })
              }
              // input_json_delta (tool args streaming) — we don't surface
              // these; the start event + later result are enough.
            } else if (ev.type === 'message_stop') {
              // Final stop — handled via finalMessage() below.
            }
          }

          const final = await llmStream.finalMessage()
          const assistantBlocks = final.content
          stopReason = final.stop_reason

          if (final.usage) {
            const u = final.usage as unknown as {
              input_tokens?: number
              output_tokens?: number
              cache_creation_input_tokens?: number
              cache_read_input_tokens?: number
            }
            console.log(
              `[chat] tokens — input=${u.input_tokens ?? 0} output=${u.output_tokens ?? 0} ` +
                `cache_write=${u.cache_creation_input_tokens ?? 0} ` +
                `cache_read=${u.cache_read_input_tokens ?? 0}`
            )
          }

          // Persist the assistant turn (with any tool_use blocks).
          await db.chatMessage.create({
            data: {
              draftId,
              role: 'assistant',
              content: extractText(assistantBlocks),
              toolCalls: assistantBlocks as unknown as object,
            },
          })

          messages.push({
            role: 'assistant',
            content: assistantBlocks as unknown as Anthropic.Messages.ContentBlockParam[],
          })

          send('assistant_turn_complete', {
            stopReason,
            hadText: extractText(assistantBlocks).length > 0,
          })

          if (stopReason !== 'tool_use') break

          // Dispatch every tool call and stream each result back.
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
          for (const block of assistantBlocks) {
            if (block.type !== 'tool_use') continue
            try {
              const result = await dispatchTool(block.name, block.input, {
                gymId,
                draftId,
              })
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
              send('tool_result', {
                id: block.id,
                name: block.name,
                ok: true,
              })
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err)
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: errMsg }),
                is_error: true,
              })
              send('tool_result', {
                id: block.id,
                name: block.name,
                ok: false,
                error: errMsg,
              })
            }
          }

          await db.chatMessage.create({
            data: {
              draftId,
              role: 'tool_result',
              content: '',
              toolCalls: toolResults as unknown as object,
            },
          })

          messages.push({
            role: 'user',
            content: toolResults as unknown as Anthropic.Messages.ContentBlockParam[],
          })
        }

        // Graceful wrap-up: if we exited still in tool_use, force a final
        // text turn so the conversation closes cleanly. Stream that too.
        if (stopReason === 'tool_use') {
          send('wrap_up_start', {})
          const wrap = anthropic.messages.stream({
            model: MODEL_ID,
            max_tokens: 1024,
            system: [
              { type: 'text', text: SYSTEM_INSTRUCTIONS },
              { type: 'text', text: staticContext },
              {
                type: 'text',
                text:
                  dynamicContext +
                  '\n\nNote: You hit the per-turn tool-call budget. ' +
                  'Summarize for the owner what got done, what is pending in the draft, ' +
                  'and what still needs to be addressed. Do NOT call any more tools.',
              },
            ],
            messages: messages as Anthropic.Messages.MessageParam[],
          })
          for await (const ev of wrap) {
            if (
              ev.type === 'content_block_delta' &&
              ev.delta.type === 'text_delta'
            ) {
              send('text_delta', { text: ev.delta.text })
            }
          }
          const wrapFinal = await wrap.finalMessage()
          await db.chatMessage.create({
            data: {
              draftId,
              role: 'assistant',
              content: extractText(wrapFinal.content),
              toolCalls: wrapFinal.content as unknown as object,
            },
          })
          stopReason = wrapFinal.stop_reason
        }

        send('done', { draftId, stopReason })
      } catch (error) {
        console.error('Chat error:', error)
        send('error', {
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable buffering on Vercel/Nginx so events reach the client
      // immediately rather than getting batched.
      'X-Accel-Buffering': 'no',
    },
  })
}

// GET — load the active draft thread.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const gymId = DEFAULT_GYM_ID
    const draft = await db.draftSchedule.findFirst({
      where: { gymId, status: 'active', createdById: session.userId },
      orderBy: { updatedAt: 'desc' },
    })

    if (!draft) {
      return NextResponse.json({ success: true, draftId: null, messages: [], proposals: [] })
    }

    const [messages, rawProposals] = await Promise.all([
      db.chatMessage.findMany({
        where: { draftId: draft.id, role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'asc' },
      }),
      db.proposedBooking.findMany({
        where: { draftId: draft.id, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Enrich proposals with athlete + trainer names for the UI grid.
    const trainerIds = [...new Set(rawProposals.map((p) => p.trainerId).filter(Boolean) as string[])]
    const athleteIds = [...new Set(rawProposals.map((p) => p.athleteId).filter(Boolean) as string[])]
    const [trainerRecords, athleteRecords] = await Promise.all([
      trainerIds.length
        ? db.trainer.findMany({
            where: { id: { in: trainerIds } },
            include: { user: { select: { name: true } } },
          })
        : Promise.resolve([]),
      athleteIds.length
        ? db.athlete.findMany({ where: { id: { in: athleteIds } } })
        : Promise.resolve([]),
    ])
    const trainerNameById = new Map(trainerRecords.map((t) => [t.id, t.user.name]))
    const athleteNameById = new Map(
      athleteRecords.map((a) => [a.id, `${a.firstName} ${a.lastName}`])
    )

    const proposals = rawProposals.map((p) => ({
      id: p.id,
      action: p.action,
      trainerName: p.trainerId ? trainerNameById.get(p.trainerId) ?? null : null,
      athleteName: p.athleteId ? athleteNameById.get(p.athleteId) ?? null : null,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      duration: p.duration,
      conflictReason: p.conflictReason,
    }))

    return NextResponse.json({
      success: true,
      draftId: draft.id,
      messages: messages
        .filter((m) => m.content || m.role === 'assistant')
        .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
      proposals,
    })
  } catch (error) {
    console.error('Chat load error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function extractText(blocks: Anthropic.Messages.ContentBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'text') parts.push(b.text)
  }
  return parts.join('\n\n')
}
