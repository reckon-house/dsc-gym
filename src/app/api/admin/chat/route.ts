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
const MAX_TOOL_ROUNDS = 50

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
${trainerLines.join('\n')}`
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
The current date/time will be in the user message context.`

// Helper for building SSE event chunks. Each event is two newlines apart
// per the protocol. JSON payload keeps things easy on the client.
function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
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

      const startedAt = Date.now()
      let stopReason: string | null = null
      let round = 0

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
            messages: messages as Anthropic.Messages.MessageParam[],
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
