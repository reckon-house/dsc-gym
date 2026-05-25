// Anthropic tool definitions exposed to the chat LLM. These are the ONLY
// way the model interacts with schedule state — it cannot bypass the
// engine.

import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import {
  addProposedChange,
  commitAllPending,
  commitChange,
  DEFAULT_GYM_ID,
  discardDraft,
  getGymTimezone,
  listProposedChanges,
  listSessions,
  suggestSlots,
  validateBooking,
  validateGroupBooking,
} from './engine'
import {
  minutesIntoDay,
  resolveAvailabilityForDate,
} from './availability'
import { dateOnlyInZone, dayOfWeekInZone, startOfDayInZone } from './timezone'

export const SCHEDULING_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_trainers',
    description:
      'List active trainers at the gym with their weekly availability windows. Use this to know who works when before proposing bookings. Archived trainers are excluded by default.',
    input_schema: {
      type: 'object',
      properties: {
        includeArchived: {
          type: 'boolean',
          description: 'Set true to also return archived trainers (e.g., for historical context).',
        },
      },
    },
  },
  {
    name: 'list_athletes',
    description:
      'List active athletes at the gym. Returns id, name, email, phone, trainer, and archived flag — use these to confirm identity before destructive actions. Optionally filter by trainer or search by any identifier (name, email, or phone fragment). Archived athletes are excluded by default.',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string', description: 'Filter to a specific trainer.' },
        nameLike: {
          type: 'string',
          description:
            'Case-insensitive substring match against first name, last name, email, OR phone. Useful for "find the athlete with email jp33@…" or "look up 214-555-0199".',
        },
        includeArchived: {
          type: 'boolean',
          description: 'Set true to also return archived athletes.',
        },
      },
    },
  },
  {
    name: 'list_sessions',
    description:
      'List committed (real) sessions in a date range. Use this to answer "who is X seeing Tuesday?" or to see the current week.',
    input_schema: {
      type: 'object',
      properties: {
        startISO: { type: 'string', description: 'Inclusive ISO start datetime.' },
        endISO: { type: 'string', description: 'Inclusive ISO end datetime.' },
        trainerId: { type: 'string', description: 'Optional trainer filter.' },
      },
      required: ['startISO', 'endISO'],
    },
  },
  {
    name: 'list_pending_proposals',
    description:
      'List the proposed changes currently in the active draft. These are NOT yet on the schedule — they need to be committed.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_availability',
    description:
      'Validate a hypothetical booking against the engine: trainer availability, double-booking, floor cap, buffer, allowed durations, etc. Returns ok + conflicts. ALWAYS call this before proposing a booking. IMPORTANT: scheduledAtISO MUST include a timezone offset. The gym is in America/Chicago (Central). For 9:00 AM Central on May 27 2026, send "2026-05-27T09:00:00-05:00" (CDT) or "2026-05-27T09:00:00-06:00" (CST). Sending bare "2026-05-27T09:00:00" (no offset) is interpreted as UTC and will produce false "outside availability" conflicts.',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        athleteId: { type: 'string' },
        scheduledAtISO: {
          type: 'string',
          description:
            'ISO 8601 datetime for the proposed start, INCLUDING timezone offset (e.g. "2026-05-27T09:00:00-05:00" for 9am CDT).',
        },
        duration: { type: 'number', description: 'Minutes. Defaults to gym default (60).' },
      },
      required: ['trainerId', 'athleteId', 'scheduledAtISO'],
    },
  },
  {
    name: 'suggest_slots',
    description:
      'Ask the engine to find open slots for a trainer on a given date. Useful when the owner says "fit Sarah in somewhere Tuesday".',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        dateISO: { type: 'string', description: 'ISO date for the day to search.' },
        duration: { type: 'number', description: 'Minutes. Defaults to 60.' },
        preferredStart: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'any'],
        },
      },
      required: ['trainerId', 'dateISO'],
    },
  },
  {
    name: 'propose_booking',
    description:
      'Add a new-session proposal to the active draft. Does NOT commit. The owner must explicitly confirm before anything is written to the schedule. If a pending proposal already exists for the same trainer/athlete/scheduledAt combo, the older one is auto-discarded — useful when you need to retry with a corrected time. scheduledAtISO MUST include a timezone offset (gym is America/Chicago; for 9am Central send "2026-05-27T09:00:00-05:00" in CDT).',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        athleteId: { type: 'string' },
        scheduledAtISO: {
          type: 'string',
          description:
            'ISO 8601 datetime WITH timezone offset (e.g. "2026-05-27T09:00:00-05:00" for 9am CDT).',
        },
        duration: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['trainerId', 'athleteId', 'scheduledAtISO'],
    },
  },
  {
    name: 'propose_move',
    description:
      'Propose moving an existing committed session to a new time/trainer. Does NOT commit. newScheduledAtISO MUST include a timezone offset (gym is America/Chicago).',
    input_schema: {
      type: 'object',
      properties: {
        existingSessionId: { type: 'string' },
        newScheduledAtISO: {
          type: 'string',
          description:
            'ISO 8601 datetime WITH timezone offset (e.g. "2026-05-27T15:00:00-05:00" for 3pm CDT).',
        },
        newTrainerId: { type: 'string' },
        newDuration: { type: 'number' },
      },
      required: ['existingSessionId', 'newScheduledAtISO'],
    },
  },
  {
    name: 'propose_cancel',
    description: 'Propose cancelling an existing committed session. Does NOT commit.',
    input_schema: {
      type: 'object',
      properties: {
        existingSessionId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['existingSessionId'],
    },
  },
  {
    name: 'commit_all_pending',
    description:
      'Commit every pending proposal in the active draft to the real schedule. Only call this when the owner has explicitly confirmed.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'commit_one',
    description: 'Commit a single pending proposal by its proposal id.',
    input_schema: {
      type: 'object',
      properties: {
        proposalId: { type: 'string' },
      },
      required: ['proposalId'],
    },
  },
  {
    name: 'discard_draft',
    description: 'Throw away every pending proposal in the active draft.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'discard_proposal',
    description:
      'Discard a single pending proposal by id. Use this to clean up stale proposals from a previous failed attempt — e.g. when you booked something with a bad timezone, recovered with a corrected version, and now want to remove the broken one. Does not touch the corrected proposal or any other proposals.',
    input_schema: {
      type: 'object',
      properties: {
        proposalId: { type: 'string' },
      },
      required: ['proposalId'],
    },
  },
  {
    name: 'set_trainer_availability',
    description:
      "Set a trainer's recurring weekly availability for a specific day. REPLACES any existing windows for that day. Use when the owner says e.g. 'Mike works Tuesdays 7am-noon'. To clear a day, pass an empty windows array.",
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        dayOfWeek: { type: 'number', description: '0=Sunday, 1=Monday, ..., 6=Saturday' },
        windows: {
          type: 'array',
          description: 'Available windows for that day. Each window is start/end minutes from midnight.',
          items: {
            type: 'object',
            properties: {
              startMinute: { type: 'number' },
              endMinute: { type: 'number' },
            },
            required: ['startMinute', 'endMinute'],
          },
        },
      },
      required: ['trainerId', 'dayOfWeek', 'windows'],
    },
  },
  {
    name: 'add_availability_exception',
    description:
      "Add a one-off override to a trainer's schedule for a specific date: time off (isAvailable=false) or extra hours (isAvailable=true). Use for vacations, sick days, or 'Sarah is in Friday only this week'.",
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        dateISO: { type: 'string', description: 'YYYY-MM-DD or full ISO date.' },
        isAvailable: { type: 'boolean' },
        startMinute: {
          type: 'number',
          description: 'Optional: only for partial-day overrides. Omit for the whole day.',
        },
        endMinute: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['trainerId', 'dateISO', 'isAvailable'],
    },
  },
  {
    name: 'propose_batch',
    description:
      'Schedule multiple sessions in one shot — the heavy-lifting tool for recurring patterns and group sessions. Use for requests like "schedule Jameson, Mike, and Paul together M/W/F at 3pm for 8 weeks" or "book Marcus every Tuesday morning through July". Each generated session is validated through the engine and added to the active draft as a proposal (still requires explicit commit). Returns per-slot accepted/conflict info so you can report what landed and what hit conflicts.',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: {
          type: 'string',
          description: 'The trainer running every slot in this batch.',
        },
        athleteIds: {
          type: 'array',
          description:
            'Athletes attending. If groupSession=true, all athletes attend each slot together (one session per slot). If groupSession=false, each athlete gets their own separate session at each slot (one session per athlete per slot).',
          items: { type: 'string' },
        },
        groupSession: {
          type: 'boolean',
          description:
            'true = one shared session per slot with all athletes attending (e.g., "schedule X, Y, Z together"). false = one session per athlete per slot (e.g., "book each of them every Monday at 9").',
        },
        daysOfWeek: {
          type: 'array',
          description: '0=Sun, 1=Mon, ..., 6=Sat. e.g. [1,3,5] for M/W/F.',
          items: { type: 'number' },
        },
        startDateISO: {
          type: 'string',
          description: 'YYYY-MM-DD or ISO. First eligible date in the range.',
        },
        endDateISO: {
          type: 'string',
          description: 'YYYY-MM-DD or ISO. Last eligible date. Either this OR weeksCount must be set.',
        },
        weeksCount: {
          type: 'number',
          description: 'Alternative to endDateISO: number of weeks starting from startDateISO.',
        },
        time: {
          type: 'string',
          description: 'HH:MM in 24h local time (gym timezone). e.g. "15:00" for 3pm.',
        },
        duration: {
          type: 'number',
          description: 'Minutes per session. Defaults to 60.',
        },
      },
      required: ['trainerId', 'athleteIds', 'groupSession', 'daysOfWeek', 'startDateISO', 'time'],
    },
  },
  {
    name: 'cancel_batch',
    description:
      'Cancel multiple committed sessions at once by filter (athlete, trainer, date range, optional day-of-week). Adds one cancel proposal per matched session to the draft. Use for "cancel all of Marcus\'s July sessions" or "cancel Mike\'s sessions next week — he\'s out sick". Returns the count.',
    input_schema: {
      type: 'object',
      properties: {
        athleteId: { type: 'string', description: 'Optional. Sessions where this athlete is the primary OR an attendee.' },
        trainerId: { type: 'string', description: 'Optional. Sessions run by this trainer.' },
        startDateISO: { type: 'string', description: 'Inclusive start of date range.' },
        endDateISO: { type: 'string', description: 'Inclusive end of date range.' },
        daysOfWeek: {
          type: 'array',
          description: 'Optional. Only match these days. 0=Sun..6=Sat.',
          items: { type: 'number' },
        },
      },
    },
  },
  {
    name: 'move_batch',
    description:
      'Move multiple committed sessions at once. Filter to find matching sessions, then apply a transformation: shift the time, change the trainer, or set a new time-of-day. Adds one move proposal per matched session (still needs explicit commit). Use for "move all 3pm group sessions to 4pm starting next week" or "shift all of Mike\'s Friday sessions to Saturday".',
    input_schema: {
      type: 'object',
      properties: {
        // Filter
        athleteId: { type: 'string' },
        trainerId: { type: 'string' },
        startDateISO: { type: 'string' },
        endDateISO: { type: 'string' },
        daysOfWeek: {
          type: 'array',
          description: 'Only match these days. 0=Sun..6=Sat.',
          items: { type: 'number' },
        },
        // Transform — provide ONE of these (or combine timeShiftMinutes with newTrainerId)
        timeShiftMinutes: {
          type: 'number',
          description: 'Shift each session by this many minutes. e.g., 60 for 1h later, -60 for 1h earlier, 1440 for next day same time.',
        },
        newTrainerId: {
          type: 'string',
          description: 'Reassign all matched sessions to this trainer (keep the time).',
        },
        newTimeOfDay: {
          type: 'string',
          description: 'HH:MM 24h. Replace the time-of-day on each session, keeping the date.',
        },
      },
    },
  },
  {
    name: 'add_athlete',
    description:
      "Onboard a new athlete the owner mentions in conversation (walk-in, referral, etc.). Use when the owner says something like 'add a new client named Jane Doe' or 'sign up Tom Smith with Mike'. Email is optional — if missing, a placeholder is generated. The athlete is created already-verified (the owner vouches for them), so they're immediately bookable. Does NOT send a confirmation email or set a password (the athlete can self-register later if they want app access).",
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', description: 'Optional. Generated if omitted.' },
        phone: { type: 'string' },
        trainerId: {
          type: 'string',
          description: 'Optional. Assign to a trainer immediately.',
        },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'add_trainer',
    description:
      "Onboard a new trainer. Creates a User account with a temporary password (default 'trainer123') and a Trainer profile. The owner should share the login info with the trainer afterward. Optionally accepts a weekly availability pattern so the engine can start scheduling them right away.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        tempPassword: {
          type: 'string',
          description: 'Optional. Defaults to "trainer123".',
        },
        weeklyHours: {
          type: 'array',
          description:
            'Optional initial availability. Each entry is one day of the week with one window. Multiple windows on the same day = multiple entries.',
          items: {
            type: 'object',
            properties: {
              dayOfWeek: { type: 'number' },
              startMinute: { type: 'number' },
              endMinute: { type: 'number' },
            },
            required: ['dayOfWeek', 'startMinute', 'endMinute'],
          },
        },
      },
      required: ['name', 'email'],
    },
  },
  {
    name: 'archive_trainer',
    description:
      'Soft-remove a trainer who has left the gym. By default: cancels all their future sessions and unassigns their athletes (sets athlete.trainerId=null). Past sessions stay intact for historical records. The trainer\'s account isn\'t deleted — they can be unarchived later.',
    input_schema: {
      type: 'object',
      properties: {
        trainerId: { type: 'string' },
        cancelFutureSessions: { type: 'boolean', description: 'Default true.' },
        unassignAthletes: { type: 'boolean', description: 'Default true.' },
      },
      required: ['trainerId'],
    },
  },
  {
    name: 'archive_athlete',
    description:
      'Soft-remove an athlete (member quit, moved away, etc.). By default cancels all their future sessions. Past sessions stay intact. The athlete record isn\'t deleted — can be unarchived later.',
    input_schema: {
      type: 'object',
      properties: {
        athleteId: { type: 'string' },
        cancelFutureSessions: { type: 'boolean', description: 'Default true.' },
      },
      required: ['athleteId'],
    },
  },
  {
    name: 'unarchive_trainer',
    description: 'Bring an archived trainer back to active status. Reactivates their existing availability rules. Does NOT restore previously cancelled sessions.',
    input_schema: {
      type: 'object',
      properties: { trainerId: { type: 'string' } },
      required: ['trainerId'],
    },
  },
  {
    name: 'unarchive_athlete',
    description: 'Bring an archived athlete back to active status. Does NOT restore previously cancelled sessions.',
    input_schema: {
      type: 'object',
      properties: { athleteId: { type: 'string' } },
      required: ['athleteId'],
    },
  },
  {
    name: 'set_athlete_standing_slot',
    description:
      "Record an athlete's recurring weekly preference (e.g. 'Marcus likes Tuesday 9am with Mike'). Used when 'filling in the week' to auto-assign athletes to their usual slot.",
    input_schema: {
      type: 'object',
      properties: {
        athleteId: { type: 'string' },
        trainerId: { type: 'string' },
        dayOfWeek: { type: 'number' },
        startMinute: { type: 'number' },
        duration: { type: 'number', description: 'Defaults to 60.' },
      },
      required: ['athleteId', 'dayOfWeek', 'startMinute'],
    },
    // cache_control on the LAST tool caches every tool definition up to
    // and including this one. Tools are huge (~5k tokens) and rarely
    // change, so caching them is the biggest single cost win.
    cache_control: { type: 'ephemeral' },
  },
]

interface DispatchContext {
  gymId: string
  draftId: string
}

export async function dispatchTool(
  name: string,
  rawInput: unknown,
  ctx: DispatchContext
): Promise<unknown> {
  const input = (rawInput ?? {}) as Record<string, unknown>
  const gymId = ctx.gymId || DEFAULT_GYM_ID

  switch (name) {
    case 'list_trainers': {
      const includeArchived = Boolean(input.includeArchived)
      const trainers = await db.trainer.findMany({
        where: { gymId, ...(includeArchived ? {} : { archived: false }) },
        include: {
          user: { select: { name: true, email: true } },
          availability: true,
        },
      })
      return trainers.map((t) => ({
        id: t.id,
        name: t.user.name,
        email: t.user.email,
        availability: t.availability.map((a) => ({
          dayOfWeek: a.dayOfWeek,
          startMinute: a.startMinute,
          endMinute: a.endMinute,
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.dayOfWeek],
          startTime: formatMinute(a.startMinute),
          endTime: formatMinute(a.endMinute),
        })),
      }))
    }

    case 'list_athletes': {
      const includeArchived = Boolean(input.includeArchived)
      const where: {
        gymId: string
        trainerId?: string
        AND?: unknown[]
        OR?: unknown[]
        archived?: false
      } = { gymId }
      if (!includeArchived) where.archived = false
      if (typeof input.trainerId === 'string') where.trainerId = input.trainerId
      if (typeof input.nameLike === 'string') {
        // Each whitespace-separated token has to land in at least one of
        // firstName / lastName / email / phone. So "Marcus Chen" needs
        // both Marcus and Chen to hit somewhere; an email like
        // "jp33.me@gmail.com" is a single token that hits the email
        // column; a phone fragment like "214-555" hits phone.
        const tokens = input.nameLike.split(/\s+/).filter(Boolean)
        const tokenWhere = (t: string) => ({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' } },
            { lastName: { contains: t, mode: 'insensitive' } },
            { email: { contains: t, mode: 'insensitive' } },
            // Phone substring: strip non-digits from the query so a user
            // typing "214-555-0199" matches stored "+12145550199".
            ...(t.replace(/\D+/g, '').length >= 3
              ? [{ phone: { contains: t.replace(/\D+/g, ''), mode: 'insensitive' } }]
              : []),
          ],
        })
        if (tokens.length === 1) {
          Object.assign(where, tokenWhere(tokens[0]))
        } else if (tokens.length > 1) {
          where.AND = tokens.map(tokenWhere)
        }
      }
      const athletes = await db.athlete.findMany({
        where: where as never,
        include: { trainer: { include: { user: { select: { name: true } } } } },
        take: 200,
      })
      return athletes.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        trainerId: a.trainerId,
        trainerName: a.trainer?.user.name ?? null,
        archived: a.archived,
        emailVerified: a.emailVerified,
      }))
    }

    case 'list_sessions': {
      const start = new Date(String(input.startISO))
      const end = new Date(String(input.endISO))
      const trainerId = typeof input.trainerId === 'string' ? input.trainerId : undefined
      const sessions = await listSessions({ gymId, start, end, trainerId })
      const enriched = await db.session.findMany({
        where: { id: { in: sessions.map((s) => s.id) } },
        include: {
          athlete: { select: { firstName: true, lastName: true } },
          trainer: { include: { user: { select: { name: true } } } },
        },
      })
      const byId = new Map(enriched.map((s) => [s.id, s]))
      return sessions.map((s) => {
        const e = byId.get(s.id)
        return {
          id: s.id,
          trainerName: e?.trainer.user.name ?? null,
          athleteName: e ? `${e.athlete.firstName} ${e.athlete.lastName}` : null,
          scheduledAt: s.scheduledAt.toISOString(),
          duration: s.duration,
          cancelled: s.cancelled,
          completed: s.completed,
        }
      })
    }

    case 'list_pending_proposals': {
      const pending = await listProposedChanges(ctx.draftId)
      const enriched = await Promise.all(
        pending.map(async (p) => {
          const [trainer, athlete] = await Promise.all([
            p.trainerId
              ? db.trainer.findUnique({
                  where: { id: p.trainerId },
                  include: { user: { select: { name: true } } },
                })
              : null,
            p.athleteId
              ? db.athlete.findUnique({ where: { id: p.athleteId } })
              : null,
          ])
          return {
            proposalId: p.id,
            action: p.action,
            trainerName: trainer?.user.name ?? null,
            athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : null,
            scheduledAt: p.scheduledAt?.toISOString() ?? null,
            duration: p.duration,
            existingSessionId: p.existingSessionId,
            conflictReason: p.conflictReason,
          }
        })
      )
      return enriched
    }

    case 'check_availability': {
      const duration = typeof input.duration === 'number' ? input.duration : 60
      return validateBooking(gymId, {
        trainerId: String(input.trainerId),
        athleteId: String(input.athleteId),
        scheduledAt: new Date(String(input.scheduledAtISO)),
        duration,
      })
    }

    case 'suggest_slots': {
      const duration = typeof input.duration === 'number' ? input.duration : 60
      const preferredStart = (input.preferredStart as
        | 'morning'
        | 'afternoon'
        | 'evening'
        | 'any'
        | undefined) ?? 'any'
      const slots = await suggestSlots({
        gymId,
        trainerId: String(input.trainerId),
        date: new Date(String(input.dateISO)),
        duration,
        preferredStart,
      })
      return slots.slice(0, 12).map((s) => ({
        startISO: s.start.toISOString(),
        endISO: s.end.toISOString(),
        startTime: s.start.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }),
      }))
    }

    case 'propose_booking': {
      const trainerId = String(input.trainerId)
      const athleteId = String(input.athleteId)
      const scheduledAt = new Date(String(input.scheduledAtISO))
      const duration = typeof input.duration === 'number' ? input.duration : 60

      // Auto-prune: if a pending proposal already exists for this exact
      // trainer+athlete+time, discard the older one. Keeps the draft
      // clean when the model retries with a corrected timezone.
      const pruned = await db.proposedBooking.updateMany({
        where: {
          draftId: ctx.draftId,
          status: 'pending',
          action: 'create',
          trainerId,
          athleteId,
          scheduledAt,
        },
        data: { status: 'discarded' },
      })

      const proposalId = await addProposedChange(ctx.draftId, {
        action: 'create',
        trainerId,
        athleteId,
        scheduledAt,
        duration,
        notes: typeof input.notes === 'string' ? input.notes : undefined,
      })
      const validation = await validateBooking(gymId, {
        trainerId,
        athleteId,
        scheduledAt,
        duration,
      })
      if (!validation.ok) {
        await db.proposedBooking.update({
          where: { id: proposalId },
          data: { conflictReason: validation.conflicts[0]?.message },
        })
      }
      return {
        proposalId,
        validation,
        ...(pruned.count > 0
          ? { replacedPriorProposals: pruned.count }
          : {}),
      }
    }

    case 'propose_move': {
      const session = await db.session.findUnique({
        where: { id: String(input.existingSessionId) },
      })
      if (!session) return { error: 'Session not found.' }
      const proposalId = await addProposedChange(ctx.draftId, {
        action: 'move',
        existingSessionId: String(input.existingSessionId),
        scheduledAt: new Date(String(input.newScheduledAtISO)),
        duration:
          typeof input.newDuration === 'number' ? input.newDuration : session.duration,
        trainerId:
          typeof input.newTrainerId === 'string'
            ? input.newTrainerId
            : session.trainerId,
      })
      return { proposalId }
    }

    case 'propose_cancel': {
      const proposalId = await addProposedChange(ctx.draftId, {
        action: 'cancel',
        existingSessionId: String(input.existingSessionId),
        notes: typeof input.reason === 'string' ? input.reason : undefined,
      })
      return { proposalId }
    }

    case 'commit_all_pending': {
      return commitAllPending(gymId, ctx.draftId)
    }

    case 'commit_one': {
      return commitChange(gymId, String(input.proposalId))
    }

    case 'discard_draft': {
      await discardDraft(ctx.draftId)
      return { ok: true }
    }

    case 'discard_proposal': {
      const proposalId = String(input.proposalId)
      const proposal = await db.proposedBooking.findUnique({
        where: { id: proposalId },
      })
      if (!proposal || proposal.draftId !== ctx.draftId) {
        return { ok: false, error: 'Proposal not found in active draft.' }
      }
      if (proposal.status !== 'pending') {
        return { ok: false, error: `Proposal already ${proposal.status}.` }
      }
      await db.proposedBooking.update({
        where: { id: proposalId },
        data: { status: 'discarded' },
      })
      return { ok: true, proposalId }
    }

    case 'set_trainer_availability': {
      const trainerId = String(input.trainerId)
      const dayOfWeek = Number(input.dayOfWeek)
      const windows = Array.isArray(input.windows)
        ? (input.windows as { startMinute: number; endMinute: number }[])
        : []
      await db.trainerAvailability.deleteMany({
        where: { trainerId, dayOfWeek },
      })
      if (windows.length > 0) {
        await db.trainerAvailability.createMany({
          data: windows.map((w) => ({
            trainerId,
            dayOfWeek,
            startMinute: Number(w.startMinute),
            endMinute: Number(w.endMinute),
          })),
        })
      }
      return { ok: true, trainerId, dayOfWeek, windowsApplied: windows.length }
    }

    case 'add_availability_exception': {
      const trainerId = String(input.trainerId)
      const date = new Date(String(input.dateISO))
      date.setUTCHours(0, 0, 0, 0)
      const exception = await db.availabilityException.create({
        data: {
          trainerId,
          date,
          isAvailable: Boolean(input.isAvailable),
          startMinute: typeof input.startMinute === 'number' ? input.startMinute : null,
          endMinute: typeof input.endMinute === 'number' ? input.endMinute : null,
          reason: typeof input.reason === 'string' ? input.reason : null,
        },
      })
      return { ok: true, exceptionId: exception.id }
    }

    case 'propose_batch': {
      const trainerId = String(input.trainerId)
      const athleteIds = Array.isArray(input.athleteIds)
        ? (input.athleteIds as string[]).map(String)
        : []
      const groupSession = Boolean(input.groupSession)
      const daysOfWeek = Array.isArray(input.daysOfWeek)
        ? (input.daysOfWeek as number[]).map(Number)
        : []
      const timeStr = String(input.time ?? '')
      const [hh, mm] = timeStr.split(':').map((x) => Number(x))
      if (isNaN(hh) || isNaN(mm)) {
        return { error: 'Invalid time — use HH:MM 24-hour.' }
      }
      const duration = typeof input.duration === 'number' ? input.duration : 60
      const zone = await getGymTimezone(gymId)

      // Parse startDate / endDate as ZONE-LOCAL midnight. Previously
      // this used setHours which is server-local (UTC on Vercel),
      // making "09:00" land at 4am Central — the bug Sonnet kept
      // catching on retries.
      const startYmd = String(input.startDateISO).slice(0, 10)
      const startDate = dateOnlyInZone(startYmd, zone)
      if (!startDate) {
        return { error: 'startDateISO must be a YYYY-MM-DD or ISO date.' }
      }

      let endDate: Date
      if (input.endDateISO) {
        const endYmd = String(input.endDateISO).slice(0, 10)
        const parsed = dateOnlyInZone(endYmd, zone)
        if (!parsed) {
          return { error: 'endDateISO must be a YYYY-MM-DD or ISO date.' }
        }
        // End-of-day is one zone-day past parsed midnight, minus a ms.
        endDate = new Date(parsed.getTime() + 24 * 60 * 60_000 - 1)
      } else if (typeof input.weeksCount === 'number') {
        endDate = new Date(startDate.getTime() + input.weeksCount * 7 * 86_400_000)
      } else {
        return { error: 'Provide endDateISO or weeksCount.' }
      }

      // Walk gym-local days. Constructing the instant as
      // `zone-midnight + hh*60 + mm` minutes lands on zone-local
      // HH:MM exactly — works through DST transitions because
      // startOfDayInZone re-anchors each iteration.
      const slotDates: Date[] = []
      let cursor = startDate
      let safety = 0
      while (cursor.getTime() <= endDate.getTime() && safety++ < 400) {
        if (daysOfWeek.includes(dayOfWeekInZone(cursor, zone))) {
          slotDates.push(new Date(cursor.getTime() + (hh * 60 + mm) * 60_000))
        }
        cursor = startOfDayInZone(new Date(cursor.getTime() + 25 * 60 * 60_000), zone)
      }

      if (slotDates.length === 0) {
        return { error: 'No dates matched the daysOfWeek + range.' }
      }
      if (athleteIds.length === 0) {
        return { error: 'No athletes specified.' }
      }

      const accepted: { proposalId: string; scheduledAtISO: string; athletes: string[] }[] = []
      const conflicts: { scheduledAtISO: string; athletes: string[]; reason: string }[] = []

      for (const at of slotDates) {
        if (groupSession) {
          // One proposal per slot, with all athletes attending.
          const validation = await validateGroupBooking(gymId, {
            trainerId,
            athleteIds,
            scheduledAt: at,
            duration,
          })
          // Even with conflicts, persist as a proposal so the owner can see it.
          // Use propose_booking semantics but with notes recording the group.
          const proposalId = await addProposedChange(ctx.draftId, {
            action: 'create',
            trainerId,
            athleteId: athleteIds[0],
            scheduledAt: at,
            duration,
            notes: `Group of ${athleteIds.length}: ${athleteIds.join(',')}`,
            conflictReason: validation.ok ? null : validation.conflicts[0]?.message,
          })
          if (validation.ok) {
            accepted.push({ proposalId, scheduledAtISO: at.toISOString(), athletes: athleteIds })
          } else {
            conflicts.push({
              scheduledAtISO: at.toISOString(),
              athletes: athleteIds,
              reason: validation.conflicts[0]?.message ?? 'Conflict',
            })
          }
        } else {
          // One proposal per athlete per slot.
          for (const athleteId of athleteIds) {
            const validation = await validateBooking(gymId, {
              trainerId,
              athleteId,
              scheduledAt: at,
              duration,
            })
            const proposalId = await addProposedChange(ctx.draftId, {
              action: 'create',
              trainerId,
              athleteId,
              scheduledAt: at,
              duration,
              conflictReason: validation.ok ? null : validation.conflicts[0]?.message,
            })
            if (validation.ok) {
              accepted.push({ proposalId, scheduledAtISO: at.toISOString(), athletes: [athleteId] })
            } else {
              conflicts.push({
                scheduledAtISO: at.toISOString(),
                athletes: [athleteId],
                reason: validation.conflicts[0]?.message ?? 'Conflict',
              })
            }
          }
        }
      }

      return {
        slotsExpanded: slotDates.length,
        accepted: accepted.length,
        conflicts: conflicts.length,
        acceptedSlots: accepted.slice(0, 10),
        conflictSlots: conflicts.slice(0, 10),
      }
    }

    case 'cancel_batch': {
      const where = buildBatchSessionWhere(gymId, input)
      const matched = await db.session.findMany({
        where,
        select: { id: true, scheduledAt: true, trainerId: true, athleteId: true },
        orderBy: { scheduledAt: 'asc' },
      })
      const days = Array.isArray(input.daysOfWeek)
        ? (input.daysOfWeek as number[]).map(Number)
        : null
      const filtered = days
        ? matched.filter((s) => days.includes(s.scheduledAt.getDay()))
        : matched
      for (const s of filtered) {
        await addProposedChange(ctx.draftId, {
          action: 'cancel',
          existingSessionId: s.id,
        })
      }
      return {
        matched: filtered.length,
        firstFew: filtered.slice(0, 5).map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt.toISOString(),
        })),
      }
    }

    case 'move_batch': {
      const where = buildBatchSessionWhere(gymId, input)
      const days = Array.isArray(input.daysOfWeek)
        ? (input.daysOfWeek as number[]).map(Number)
        : null
      const all = await db.session.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
      })
      const matched = days
        ? all.filter((s) => days.includes(s.scheduledAt.getDay()))
        : all
      if (matched.length === 0) {
        return { matched: 0, message: 'No sessions matched.' }
      }

      // Determine transform.
      const timeShift = typeof input.timeShiftMinutes === 'number' ? input.timeShiftMinutes : 0
      const newTrainerId = typeof input.newTrainerId === 'string' ? input.newTrainerId : null
      const newTimeOfDay = typeof input.newTimeOfDay === 'string' ? input.newTimeOfDay : null
      if (timeShift === 0 && !newTrainerId && !newTimeOfDay) {
        return { error: 'Provide timeShiftMinutes, newTrainerId, or newTimeOfDay.' }
      }

      let parsedTOD: { hh: number; mm: number } | null = null
      if (newTimeOfDay) {
        const [h, m] = newTimeOfDay.split(':').map((x) => Number(x))
        if (isNaN(h) || isNaN(m)) return { error: 'Invalid newTimeOfDay.' }
        parsedTOD = { hh: h, mm: m }
      }

      const proposedIds: string[] = []
      for (const s of matched) {
        const next = new Date(s.scheduledAt)
        if (parsedTOD) {
          next.setHours(parsedTOD.hh, parsedTOD.mm, 0, 0)
        }
        if (timeShift) {
          next.setTime(next.getTime() + timeShift * 60_000)
        }
        const validation = await validateBooking(
          gymId,
          {
            trainerId: newTrainerId ?? s.trainerId,
            athleteId: s.athleteId,
            scheduledAt: next,
            duration: s.duration,
          },
          s.id // ignore the session itself
        )
        const id = await addProposedChange(ctx.draftId, {
          action: 'move',
          existingSessionId: s.id,
          scheduledAt: next,
          trainerId: newTrainerId ?? s.trainerId,
          duration: s.duration,
          conflictReason: validation.ok ? null : validation.conflicts[0]?.message,
        })
        proposedIds.push(id)
      }
      return {
        matched: matched.length,
        proposalsAdded: proposedIds.length,
        firstFew: matched.slice(0, 5).map((s) => ({
          id: s.id,
          oldAt: s.scheduledAt.toISOString(),
        })),
      }
    }

    case 'add_athlete': {
      const firstName = String(input.firstName ?? '').trim()
      const lastName = String(input.lastName ?? '').trim()
      if (!firstName || !lastName) {
        return { error: 'firstName and lastName are required.' }
      }
      const providedEmail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
      const email =
        providedEmail ||
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@placeholder.com`

      // Check for collision on real email.
      if (providedEmail) {
        const existing = await db.athlete.findUnique({ where: { email } })
        if (existing) {
          return {
            error: `An athlete with email ${email} already exists.`,
            existingAthleteId: existing.id,
          }
        }
      }

      const athlete = await db.athlete.create({
        data: {
          gymId,
          firstName,
          lastName,
          email,
          phone: typeof input.phone === 'string' ? input.phone : null,
          trainerId: typeof input.trainerId === 'string' ? input.trainerId : null,
          emailVerified: true, // owner-vouched
        },
      })
      return {
        ok: true,
        athleteId: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        emailUsed: email,
        wasPlaceholderEmail: !providedEmail,
      }
    }

    case 'add_trainer': {
      const name = String(input.name ?? '').trim()
      const email = String(input.email ?? '').trim().toLowerCase()
      if (!name || !email) {
        return { error: 'name and email are required.' }
      }
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return {
          error: `A user with email ${email} already exists.`,
          existingUserId: existing.id,
        }
      }
      const tempPassword =
        typeof input.tempPassword === 'string' && input.tempPassword.length >= 6
          ? input.tempPassword
          : 'trainer123'
      const passwordHash = await hashPassword(tempPassword)
      const user = await db.user.create({
        data: {
          email,
          name,
          role: 'TRAINER',
          passwordHash,
          trainer: { create: { gymId } },
        },
        include: { trainer: true },
      })

      // Optional initial weekly availability.
      const weeklyHours = Array.isArray(input.weeklyHours)
        ? (input.weeklyHours as {
            dayOfWeek: number
            startMinute: number
            endMinute: number
          }[])
        : []
      if (weeklyHours.length > 0 && user.trainer) {
        await db.trainerAvailability.createMany({
          data: weeklyHours.map((w) => ({
            trainerId: user.trainer!.id,
            dayOfWeek: Number(w.dayOfWeek),
            startMinute: Number(w.startMinute),
            endMinute: Number(w.endMinute),
          })),
        })
      }

      return {
        ok: true,
        trainerId: user.trainer?.id,
        userId: user.id,
        email: user.email,
        tempPassword,
        availabilityWindows: weeklyHours.length,
      }
    }

    case 'archive_trainer': {
      const trainerId = String(input.trainerId)
      const trainer = await db.trainer.findUnique({
        where: { id: trainerId },
        include: { user: { select: { name: true } } },
      })
      if (!trainer || trainer.gymId !== gymId) {
        return { error: 'Trainer not found.' }
      }

      const cancelFuture = input.cancelFutureSessions !== false
      const unassign = input.unassignAthletes !== false
      let cancelled = 0
      let unassigned = 0

      await db.trainer.update({ where: { id: trainerId }, data: { archived: true } })

      if (cancelFuture) {
        const result = await db.session.updateMany({
          where: {
            trainerId,
            cancelled: false,
            scheduledAt: { gte: new Date() },
          },
          data: { cancelled: true },
        })
        cancelled = result.count
      }

      if (unassign) {
        const result = await db.athlete.updateMany({
          where: { trainerId },
          data: { trainerId: null },
        })
        unassigned = result.count
      }

      return {
        ok: true,
        trainerName: trainer.user.name,
        sessionsCancelled: cancelled,
        athletesUnassigned: unassigned,
      }
    }

    case 'archive_athlete': {
      const athleteId = String(input.athleteId)
      const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
      if (!athlete || athlete.gymId !== gymId) {
        return { error: 'Athlete not found.' }
      }

      const cancelFuture = input.cancelFutureSessions !== false
      let cancelled = 0

      await db.athlete.update({ where: { id: athleteId }, data: { archived: true } })

      if (cancelFuture) {
        // Cancel sessions where they're the primary OR an attendee.
        const futureWhere = {
          cancelled: false,
          scheduledAt: { gte: new Date() },
          OR: [
            { athleteId },
            { attendees: { some: { athleteId } } },
          ],
        }
        const sessions = await db.session.findMany({
          where: futureWhere,
          include: { attendees: true },
        })
        for (const s of sessions) {
          // If group session and this is just one of many, drop them from
          // attendees rather than cancelling the whole group.
          const otherAttendees = s.attendees.filter((a) => a.athleteId !== athleteId)
          if (otherAttendees.length > 0 && s.athleteId !== athleteId) {
            await db.sessionAttendee.deleteMany({
              where: { sessionId: s.id, athleteId },
            })
          } else {
            await db.session.update({
              where: { id: s.id },
              data: { cancelled: true },
            })
            cancelled++
          }
        }
      }

      return {
        ok: true,
        athleteName: `${athlete.firstName} ${athlete.lastName}`,
        sessionsCancelled: cancelled,
      }
    }

    case 'unarchive_trainer': {
      const trainerId = String(input.trainerId)
      const trainer = await db.trainer.findUnique({ where: { id: trainerId } })
      if (!trainer || trainer.gymId !== gymId) {
        return { error: 'Trainer not found.' }
      }
      await db.trainer.update({ where: { id: trainerId }, data: { archived: false } })
      return { ok: true }
    }

    case 'unarchive_athlete': {
      const athleteId = String(input.athleteId)
      const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
      if (!athlete || athlete.gymId !== gymId) {
        return { error: 'Athlete not found.' }
      }
      await db.athlete.update({ where: { id: athleteId }, data: { archived: false } })
      return { ok: true }
    }

    case 'set_athlete_standing_slot': {
      const athleteId = String(input.athleteId)
      const slot = await db.athleteStandingSlot.create({
        data: {
          athleteId,
          trainerId: typeof input.trainerId === 'string' ? input.trainerId : null,
          dayOfWeek: Number(input.dayOfWeek),
          startMinute: Number(input.startMinute),
          duration: typeof input.duration === 'number' ? input.duration : 60,
        },
      })
      return { ok: true, slotId: slot.id }
    }
  }
  return { error: `Unknown tool: ${name}` }
}

interface BatchFilterInput {
  athleteId?: unknown
  trainerId?: unknown
  startDateISO?: unknown
  endDateISO?: unknown
}

function buildBatchSessionWhere(gymId: string, input: BatchFilterInput) {
  const athleteId = typeof input.athleteId === 'string' ? input.athleteId : undefined
  const trainerId = typeof input.trainerId === 'string' ? input.trainerId : undefined
  const startISO = typeof input.startDateISO === 'string' ? input.startDateISO : undefined
  const endISO = typeof input.endDateISO === 'string' ? input.endDateISO : undefined

  const scheduledAt: { gte?: Date; lte?: Date } = {}
  if (startISO) scheduledAt.gte = new Date(startISO)
  if (endISO) scheduledAt.lte = new Date(endISO)

  return {
    gymId,
    cancelled: false,
    ...(trainerId ? { trainerId } : {}),
    ...(athleteId
      ? {
          OR: [
            { athleteId },
            { attendees: { some: { athleteId } } },
          ],
        }
      : {}),
    ...(startISO || endISO ? { scheduledAt } : {}),
  } as const
}

function formatMinute(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  const ampm = h < 12 ? 'am' : 'pm'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(min).padStart(2, '0')}${ampm}`
}

// Re-export for routes.
export { minutesIntoDay, resolveAvailabilityForDate }
