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
const MODEL_ID = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
const MAX_TOOL_ROUNDS = 8

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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const userMessage: string = body.message ?? ''
    const reset: boolean = !!body.reset

    if (!userMessage.trim() && !reset) {
      return NextResponse.json({ success: false, error: 'Empty message' }, { status: 400 })
    }

    const gymId = DEFAULT_GYM_ID

    // If reset, discard any active draft so a fresh one is created.
    if (reset) {
      await db.draftSchedule.updateMany({
        where: { gymId, status: 'active', createdById: session.userId },
        data: { status: 'discarded' },
      })
    }

    const draftId = await getOrCreateActiveDraft(gymId, session.userId)

    // Persist the user message immediately so the UI can render even
    // if the model errors out.
    if (userMessage.trim()) {
      await db.chatMessage.create({
        data: { draftId, role: 'user', content: userMessage },
      })
    }

    // Load thread history.
    const history = await db.chatMessage.findMany({
      where: { draftId },
      orderBy: { createdAt: 'asc' },
    })

    // Build messages for Anthropic from stored history.
    const messages: StoredMessage[] = []
    for (const m of history) {
      if (m.role === 'user') {
        messages.push({ role: 'user', content: [{ type: 'text', text: m.content }] })
      } else if (m.role === 'assistant') {
        // toolCalls may contain saved tool_use blocks; we reconstruct.
        const stored = (m.toolCalls as Anthropic.Messages.ContentBlockParam[] | null) ?? null
        if (stored) {
          messages.push({ role: 'assistant', content: stored })
        } else if (m.content) {
          messages.push({ role: 'assistant', content: [{ type: 'text', text: m.content }] })
        }
      } else if (m.role === 'tool_result') {
        // Tool results live in a user-role message in Anthropic's API.
        const stored = (m.toolCalls as Anthropic.Messages.ContentBlockParam[] | null) ?? null
        if (stored) messages.push({ role: 'user', content: stored })
      }
    }

    const staticContext = await loadStaticContext(gymId)
    const dynamicContext = `Current date/time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (America/Chicago)`

    const anthropic = getAnthropic()

    let assistantBlocks: Anthropic.Messages.ContentBlock[] = []
    let stopReason: string | null = null
    let round = 0

    while (round < MAX_TOOL_ROUNDS) {
      round++
      const resp = await anthropic.messages.create({
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

      assistantBlocks = resp.content
      stopReason = resp.stop_reason

      // Cache visibility — logged to Vercel logs so we can verify the
      // ephemeral cache is doing its job. cache_read_input_tokens > 0
      // on subsequent turns = the static + tools prefix is being reused.
      if (resp.usage) {
        const u = resp.usage as unknown as {
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

      // Persist the assistant turn (including any tool_use blocks).
      await db.chatMessage.create({
        data: {
          draftId,
          role: 'assistant',
          content: extractText(assistantBlocks),
          toolCalls: assistantBlocks as unknown as object,
        },
      })

      // Append to in-memory messages so the next round sees it.
      messages.push({
        role: 'assistant',
        content: assistantBlocks as unknown as Anthropic.Messages.ContentBlockParam[],
      })

      if (stopReason !== 'tool_use') break

      // Dispatch every tool call and collect results.
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
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: String(err) }),
            is_error: true,
          })
        }
      }

      // Persist tool results (they look like a user-role message to Anthropic).
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

    return NextResponse.json({
      success: true,
      draftId,
      assistantText: extractText(assistantBlocks),
      stopReason,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
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
