// The scheduling engine. Deterministic, talks to Prisma only.
// Every booking decision passes through here. The LLM never writes to
// Session directly — it calls functions in this module.

import { db } from '@/lib/db'
import {
  isWithinWindows,
  resolveAvailabilityForDate,
} from './availability'
import {
  endOfDayInZone,
  formatHuman,
  formatTime,
  minutesIntoDayInZone,
  partsInZone,
  startOfDayInZone,
} from './timezone'
import type {
  BookingInput,
  Conflict,
  GroupBookingInput,
  ProposedChange,
  ScheduledSession,
  SlotSuggestion,
  ValidationResult,
} from './types'

const DEFAULT_GYM_ID = 'dsc_default_gym'

async function loadConfig(gymId: string) {
  const [config, gym] = await Promise.all([
    db.gymConfig.findUnique({ where: { gymId } }),
    db.gym.findUnique({ where: { id: gymId }, select: { timezone: true } }),
  ])
  if (!config) {
    throw new Error(`No GymConfig for gym ${gymId}`)
  }
  if (!gym) {
    throw new Error(`No Gym row for ${gymId}`)
  }
  let sessionLengths: number[] = [30, 60]
  try {
    sessionLengths = JSON.parse(config.sessionLengthsJson)
  } catch {
    /* fallback */
  }
  return {
    floorCap: config.floorCap,
    sessionLengths,
    bufferMinutes: config.bufferMinutes,
    allowSameTrainerSameDay: config.allowSameTrainerSameDay,
    cancellationPolicyHours: config.cancellationPolicyHours,
    defaultSessionMinutes: config.defaultSessionMinutes,
    timezone: gym.timezone,
  }
}

export async function getGymTimezone(gymId: string): Promise<string> {
  const gym = await db.gym.findUnique({
    where: { id: gymId },
    select: { timezone: true },
  })
  return gym?.timezone ?? 'America/Chicago'
}

export async function validateBooking(
  gymId: string,
  input: BookingInput,
  ignoreSessionId?: string
): Promise<ValidationResult> {
  const conflicts: Conflict[] = []
  const config = await loadConfig(gymId)
  const zone = config.timezone
  const start = new Date(input.scheduledAt)
  const end = new Date(start.getTime() + input.duration * 60_000)

  // 0. Past time.
  if (start.getTime() < Date.now() - 60_000) {
    conflicts.push({
      kind: 'PAST_TIME',
      message: `${formatHuman(start, zone)} is in the past.`,
    })
  }

  // 1. Trainer and athlete exist & belong to this gym.
  const [trainer, athlete] = await Promise.all([
    db.trainer.findUnique({
      where: { id: input.trainerId },
      include: { user: { select: { name: true } } },
    }),
    db.athlete.findUnique({ where: { id: input.athleteId } }),
  ])
  if (!trainer || trainer.gymId !== gymId) {
    conflicts.push({
      kind: 'UNKNOWN_TRAINER',
      message: `Trainer ${input.trainerId} not found at this gym.`,
    })
  } else if (trainer.archived) {
    conflicts.push({
      kind: 'UNKNOWN_TRAINER',
      message: `${trainer.user.name} is archived and can't take new sessions.`,
    })
  }
  if (!athlete || athlete.gymId !== gymId) {
    conflicts.push({
      kind: 'UNKNOWN_ATHLETE',
      message: `Athlete ${input.athleteId} not found at this gym.`,
    })
  } else if (athlete.archived) {
    conflicts.push({
      kind: 'UNKNOWN_ATHLETE',
      message: `${athlete.firstName} ${athlete.lastName} is archived and can't be booked.`,
    })
  }

  // 2. Session length allowed.
  if (!config.sessionLengths.includes(input.duration)) {
    conflicts.push({
      kind: 'DISALLOWED_DURATION',
      message: `${input.duration}-minute sessions aren't allowed. Allowed: ${config.sessionLengths.join(', ')}.`,
    })
  }

  // If trainer is unknown we can't run trainer-specific checks.
  if (!trainer || trainer.gymId !== gymId) {
    return { ok: conflicts.length === 0, conflicts }
  }

  // 3. Inside the trainer's availability window for that day.
  // Both "what day" and "what minutes" are interpreted in the gym's zone.
  const availability = await resolveAvailabilityForDate(input.trainerId, start, zone)
  const startMin = minutesIntoDayInZone(start, zone)
  const endMin = startMin + input.duration
  if (!isWithinWindows(startMin, endMin, availability.windows)) {
    conflicts.push({
      kind: 'OUTSIDE_AVAILABILITY',
      message: `${trainer.user.name} isn't available ${formatHuman(start, zone)} – ${formatTime(end, zone)}.`,
      details: { windows: availability.windows },
    })
  }

  // 4. No double-booking for this trainer (with buffer). "Same day" is
  // the gym-local calendar day, not the server's UTC day.
  const dayStart = startOfDayInZone(start, zone)
  const dayEnd = endOfDayInZone(start, zone)

  const sameDaySessions = await db.session.findMany({
    where: {
      trainerId: input.trainerId,
      cancelled: false,
      scheduledAt: { gte: dayStart, lt: dayEnd },
      NOT: ignoreSessionId ? { id: ignoreSessionId } : undefined,
    },
    include: { athlete: true },
  })

  const bufferMs = config.bufferMinutes * 60_000
  for (const s of sameDaySessions) {
    const sStart = s.scheduledAt.getTime()
    const sEnd = sStart + s.duration * 60_000
    const overlap = start.getTime() < sEnd + bufferMs && end.getTime() > sStart - bufferMs
    if (overlap) {
      const kind: 'BUFFER_VIOLATION' | 'TRAINER_DOUBLE_BOOKED' =
        config.bufferMinutes && (start.getTime() >= sEnd || end.getTime() <= sStart)
          ? 'BUFFER_VIOLATION'
          : 'TRAINER_DOUBLE_BOOKED'
      const window = `${formatTime(new Date(sStart), zone)} – ${formatTime(new Date(sEnd), zone)}`
      conflicts.push({
        kind,
        // Admin-facing: includes the other athlete's name so Jordan can
        // coordinate.
        message: `${trainer.user.name} is already with ${s.athlete.firstName} ${s.athlete.lastName} ${window}.`,
        // Athlete-facing: same trainer + same time window, NO other-
        // athlete identity.
        publicMessage:
          kind === 'BUFFER_VIOLATION'
            ? `${trainer.user.name} has a session right next to that slot (${window}). The gym wants a buffer between sessions.`
            : `${trainer.user.name} is already booked ${window}.`,
        details: { conflictingSessionId: s.id },
      })
    }
  }

  // 5. Same-trainer-same-day rule (if disabled).
  if (
    !config.allowSameTrainerSameDay &&
    athlete &&
    sameDaySessions.some((s) => s.athleteId === input.athleteId)
  ) {
    conflicts.push({
      kind: 'SAME_TRAINER_SAME_DAY',
      message: `${athlete.firstName} already has a session with ${trainer.user.name} that day.`,
    })
  }

  // 6. Floor cap — across all trainers at the gym.
  if (config.floorCap > 0) {
    const sameDayAll = await db.session.findMany({
      where: {
        gymId,
        cancelled: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
        NOT: ignoreSessionId ? { id: ignoreSessionId } : undefined,
      },
      select: { id: true, scheduledAt: true, duration: true },
    })
    const overlapping = sameDayAll.filter((s) => {
      const sEnd = new Date(s.scheduledAt.getTime() + s.duration * 60_000)
      return s.scheduledAt < end && sEnd > start
    })
    if (overlapping.length >= config.floorCap) {
      conflicts.push({
        kind: 'FLOOR_CAP_EXCEEDED',
        message: `Floor cap reached: ${config.floorCap} sessions already overlap ${formatTime(start, zone)} – ${formatTime(end, zone)}.`,
        details: { overlappingSessionIds: overlapping.map((o) => o.id) },
      })
    }
  }

  return { ok: conflicts.length === 0, conflicts }
}

// Group-aware validator. Checks the trainer slot once, then verifies
// each athlete isn't already booked elsewhere at the same time.
export async function validateGroupBooking(
  gymId: string,
  input: GroupBookingInput,
  ignoreSessionId?: string
): Promise<ValidationResult> {
  if (input.athleteIds.length === 0) {
    return {
      ok: false,
      conflicts: [{ kind: 'UNKNOWN_ATHLETE', message: 'No attendees specified.' }],
    }
  }
  // Run a one-on-one validate for the slot itself using the first athlete.
  const slotCheck = await validateBooking(
    gymId,
    {
      trainerId: input.trainerId,
      athleteId: input.athleteIds[0],
      scheduledAt: input.scheduledAt,
      duration: input.duration,
    },
    ignoreSessionId
  )
  const conflicts: Conflict[] = [...slotCheck.conflicts]

  // Now check each ADDITIONAL athlete: do they have a different session
  // (with someone else) at this same time? That would be a real conflict.
  const start = new Date(input.scheduledAt)
  const end = new Date(start.getTime() + input.duration * 60_000)
  const otherAthletes = input.athleteIds.slice(1)

  for (const athleteId of otherAthletes) {
    const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
    if (!athlete || athlete.gymId !== gymId) {
      conflicts.push({
        kind: 'UNKNOWN_ATHLETE',
        message: `Athlete ${athleteId} not found at this gym.`,
      })
      continue
    }
    // Find any sessions this athlete is part of that overlap.
    const overlapping = await db.session.findMany({
      where: {
        cancelled: false,
        gymId,
        NOT: ignoreSessionId ? { id: ignoreSessionId } : undefined,
        OR: [
          { athleteId },
          { attendees: { some: { athleteId } } },
        ],
        scheduledAt: { lt: end },
      },
      select: { id: true, scheduledAt: true, duration: true, trainerId: true },
    })
    for (const s of overlapping) {
      const sEnd = new Date(s.scheduledAt.getTime() + s.duration * 60_000)
      if (s.scheduledAt < end && sEnd > start) {
        // If it's the SAME trainer + slot, that's the group itself (or a
        // session we're modifying) — not a real conflict.
        if (s.trainerId === input.trainerId && s.scheduledAt.getTime() === start.getTime()) {
          continue
        }
        conflicts.push({
          kind: 'TRAINER_DOUBLE_BOOKED',
          message: `${athlete.firstName} ${athlete.lastName} is already in another session at this time.`,
          details: { conflictingSessionId: s.id },
        })
      }
    }
  }

  return { ok: conflicts.length === 0, conflicts }
}

// Create a session with any number of attendees. athleteId on the row is the
// first attendee (backwards compat); attendees join carries the full list.
export async function createGroupSession(
  gymId: string,
  input: GroupBookingInput
): Promise<{ sessionId: string }> {
  const [primary, ...rest] = input.athleteIds
  const session = await db.session.create({
    data: {
      gymId,
      trainerId: input.trainerId,
      athleteId: primary,
      scheduledAt: input.scheduledAt,
      duration: input.duration,
      attendees: {
        create: input.athleteIds.map((id) => ({ athleteId: id })),
      },
    },
  })
  void rest // primary is also in attendees; rest is just for clarity
  return { sessionId: session.id }
}

export async function suggestSlots(args: {
  gymId: string
  trainerId: string
  date: Date
  duration: number
  preferredStart?: 'morning' | 'afternoon' | 'evening' | 'any'
}): Promise<SlotSuggestion[]> {
  const config = await loadConfig(args.gymId)
  const zone = config.timezone
  const duration = args.duration || config.defaultSessionMinutes
  const availability = await resolveAvailabilityForDate(args.trainerId, args.date, zone)

  // Pull existing bookings for that gym-local day.
  const dayStart = startOfDayInZone(args.date, zone)
  const dayEnd = endOfDayInZone(args.date, zone)

  const existing = await db.session.findMany({
    where: {
      trainerId: args.trainerId,
      cancelled: false,
      scheduledAt: { gte: dayStart, lt: dayEnd },
    },
    select: { scheduledAt: true, duration: true },
  })

  const occupied = existing.map((s) => ({
    start: minutesIntoDayInZone(s.scheduledAt, zone),
    end: minutesIntoDayInZone(s.scheduledAt, zone) + s.duration + config.bufferMinutes,
  }))

  const suggestions: SlotSuggestion[] = []
  const step = 30 // try every half hour
  for (const w of availability.windows) {
    for (let t = w.startMinute; t + duration <= w.endMinute; t += step) {
      const slotEnd = t + duration
      const collides = occupied.some(
        (o) => t < o.end && slotEnd > o.start - config.bufferMinutes
      )
      if (collides) continue
      // Construct the instant for `dayStart + t minutes`. dayStart is the
      // exact instant of zone-midnight, so adding `t` minutes lands on
      // zone-local HH:MM.
      const start = new Date(dayStart.getTime() + t * 60_000)
      const end = new Date(start.getTime() + duration * 60_000)
      suggestions.push({ trainerId: args.trainerId, start, end })
    }
  }

  // Filter by time-of-day preference if given. Hours are in gym zone.
  if (args.preferredStart && args.preferredStart !== 'any') {
    const within = {
      morning: (h: number) => h < 12,
      afternoon: (h: number) => h >= 12 && h < 17,
      evening: (h: number) => h >= 17,
    }[args.preferredStart]
    return suggestions.filter((s) => within(partsInZone(s.start, zone).hour))
  }
  return suggestions
}

export async function listSessions(args: {
  gymId: string
  start: Date
  end: Date
  trainerId?: string
}): Promise<ScheduledSession[]> {
  const sessions = await db.session.findMany({
    where: {
      gymId: args.gymId,
      scheduledAt: { gte: args.start, lte: args.end },
      ...(args.trainerId ? { trainerId: args.trainerId } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
  })
  return sessions.map((s) => ({
    id: s.id,
    gymId: s.gymId,
    trainerId: s.trainerId,
    athleteId: s.athleteId,
    scheduledAt: s.scheduledAt,
    duration: s.duration,
    cancelled: s.cancelled,
    completed: s.completed,
  }))
}

// Draft management — every chat session has a draft.
export async function getOrCreateActiveDraft(
  gymId: string,
  userId: string | null
): Promise<string> {
  const existing = await db.draftSchedule.findFirst({
    where: { gymId, status: 'active', createdById: userId },
    orderBy: { updatedAt: 'desc' },
  })
  if (existing) return existing.id
  const draft = await db.draftSchedule.create({
    data: { gymId, createdById: userId },
  })
  return draft.id
}

export async function addProposedChange(
  draftId: string,
  change: ProposedChange
): Promise<string> {
  const proposal = await db.proposedBooking.create({
    data: {
      draftId,
      action: change.action,
      trainerId: change.trainerId,
      athleteId: change.athleteId,
      scheduledAt: change.scheduledAt,
      duration: change.duration ?? 60,
      existingSessionId: change.existingSessionId,
      notes: change.notes,
      conflictReason: change.conflictReason ?? null,
    },
  })
  await db.draftSchedule.update({
    where: { id: draftId },
    data: { updatedAt: new Date() },
  })
  return proposal.id
}

export async function listProposedChanges(draftId: string) {
  return db.proposedBooking.findMany({
    where: { draftId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
}

// Commit a single proposed change to the real Session table.
// Re-validates first — proposals can go stale between propose and commit.
export async function commitChange(
  gymId: string,
  proposalId: string
): Promise<{ ok: boolean; sessionId?: string; conflicts?: Conflict[] }> {
  const p = await db.proposedBooking.findUnique({ where: { id: proposalId } })
  if (!p || p.status !== 'pending') {
    return { ok: false, conflicts: [{ kind: 'UNKNOWN_TRAINER', message: 'Proposal not found or already resolved.' }] }
  }

  if (p.action === 'create' && p.trainerId && p.athleteId && p.scheduledAt) {
    // Group proposals stash the attendee list in notes as "Group of N: id1,id2,id3".
    const groupMatch = p.notes?.match(/^Group of \d+:\s*(.+)$/)
    const athleteIds = groupMatch
      ? groupMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      : [p.athleteId]

    const validation =
      athleteIds.length > 1
        ? await validateGroupBooking(gymId, {
            trainerId: p.trainerId,
            athleteIds,
            scheduledAt: p.scheduledAt,
            duration: p.duration,
          })
        : await validateBooking(gymId, {
            trainerId: p.trainerId,
            athleteId: p.athleteId,
            scheduledAt: p.scheduledAt,
            duration: p.duration,
          })
    if (!validation.ok) {
      await db.proposedBooking.update({
        where: { id: proposalId },
        data: { status: 'rejected', conflictReason: validation.conflicts[0]?.message },
      })
      return { ok: false, conflicts: validation.conflicts }
    }
    const session = await db.session.create({
      data: {
        gymId,
        trainerId: p.trainerId,
        athleteId: p.athleteId,
        scheduledAt: p.scheduledAt,
        duration: p.duration,
        notes: groupMatch ? null : p.notes,
        attendees: { create: athleteIds.map((id) => ({ athleteId: id })) },
      },
    })
    await db.proposedBooking.update({
      where: { id: proposalId },
      data: { status: 'committed' },
    })
    return { ok: true, sessionId: session.id }
  }

  if (p.action === 'move' && p.existingSessionId && p.scheduledAt) {
    const existing = await db.session.findUnique({ where: { id: p.existingSessionId } })
    if (!existing) return { ok: false, conflicts: [{ kind: 'UNKNOWN_TRAINER', message: 'Original session not found.' }] }
    const validation = await validateBooking(
      gymId,
      {
        trainerId: p.trainerId ?? existing.trainerId,
        athleteId: p.athleteId ?? existing.athleteId,
        scheduledAt: p.scheduledAt,
        duration: p.duration ?? existing.duration,
      },
      p.existingSessionId
    )
    if (!validation.ok) {
      await db.proposedBooking.update({
        where: { id: proposalId },
        data: { status: 'rejected', conflictReason: validation.conflicts[0]?.message },
      })
      return { ok: false, conflicts: validation.conflicts }
    }
    await db.session.update({
      where: { id: p.existingSessionId },
      data: {
        scheduledAt: p.scheduledAt,
        duration: p.duration ?? existing.duration,
        trainerId: p.trainerId ?? existing.trainerId,
      },
    })
    await db.proposedBooking.update({
      where: { id: proposalId },
      data: { status: 'committed' },
    })
    return { ok: true, sessionId: p.existingSessionId }
  }

  if (p.action === 'cancel' && p.existingSessionId) {
    await db.session.update({
      where: { id: p.existingSessionId },
      data: { cancelled: true },
    })
    await db.proposedBooking.update({
      where: { id: proposalId },
      data: { status: 'committed' },
    })
    return { ok: true, sessionId: p.existingSessionId }
  }

  return { ok: false, conflicts: [{ kind: 'UNKNOWN_TRAINER', message: 'Invalid proposal shape.' }] }
}

export async function commitAllPending(
  gymId: string,
  draftId: string
): Promise<{ committed: string[]; failed: { id: string; conflicts: Conflict[] }[] }> {
  const pending = await listProposedChanges(draftId)
  const committed: string[] = []
  const failed: { id: string; conflicts: Conflict[] }[] = []
  for (const p of pending) {
    const result = await commitChange(gymId, p.id)
    if (result.ok) committed.push(result.sessionId!)
    else failed.push({ id: p.id, conflicts: result.conflicts ?? [] })
  }
  // Mark the draft as committed once everything is processed.
  await db.draftSchedule.update({
    where: { id: draftId },
    data: { status: failed.length === 0 ? 'committed' : 'active' },
  })
  return { committed, failed }
}

export async function discardDraft(draftId: string) {
  await db.proposedBooking.updateMany({
    where: { draftId, status: 'pending' },
    data: { status: 'discarded' },
  })
  await db.draftSchedule.update({
    where: { id: draftId },
    data: { status: 'discarded' },
  })
}

// ---------------- Standing weekly slots ----------------
//
// A standing slot says "this athlete, this trainer, every <day> at <time>,
// for <duration> minutes." Materializing turns the next N weeks of those
// recurring slots into concrete Session rows the engine can reason about
// (conflict checks, calendars, etc.). The slot itself is the source of
// truth for the recurrence rule; materialized Sessions are real
// individual bookings that can be cancelled / moved independently.

export interface MaterializeResult {
  created: { sessionId: string; scheduledAt: string }[]
  skipped: { date: string; reason: string }[]
}

export async function materializeStandingSlot(
  slotId: string,
  weeksAhead: number
): Promise<MaterializeResult> {
  const slot = await db.athleteStandingSlot.findUnique({
    where: { id: slotId },
    include: {
      athlete: { select: { id: true, gymId: true } },
    },
  })
  if (!slot || !slot.active) {
    return { created: [], skipped: [{ date: 'n/a', reason: 'Slot not active' }] }
  }
  if (!slot.trainerId) {
    return {
      created: [],
      skipped: [{ date: 'n/a', reason: 'Slot has no trainer assigned' }],
    }
  }

  const gymId = slot.athlete.gymId
  const config = await loadConfig(gymId)
  const zone = config.timezone

  const created: MaterializeResult['created'] = []
  const skipped: MaterializeResult['skipped'] = []

  // Find the next occurrence of slot.dayOfWeek (0=Sun..6=Sat) in the
  // gym's local time, starting from today.
  const today = startOfDayInZone(new Date(), zone)
  const todayDow = partsInZone(today, zone).weekday

  // How many days forward to land on the slot's day-of-week.
  // 0 means today (we still include it if the time hasn't passed yet).
  let daysAhead = (slot.dayOfWeek - todayDow + 7) % 7

  for (let week = 0; week < weeksAhead; week++) {
    // Compute the candidate date this iteration.
    const reference = new Date(today.getTime() + (daysAhead + week * 7) * 86400_000)
    const dayStart = startOfDayInZone(reference, zone)
    const scheduledAt = new Date(dayStart.getTime() + slot.startMinute * 60_000)
    const ymd = (() => {
      const p = partsInZone(dayStart, zone)
      return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    })()

    // Skip past-time on the very first occurrence if today's slot already passed.
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      skipped.push({ date: ymd, reason: 'Already in the past.' })
      continue
    }

    // De-dupe: if a Session already exists for (trainer, athlete, scheduledAt)
    // we don't want to create another. Could happen if the slot was already
    // materialized once and someone re-runs.
    const existing = await db.session.findFirst({
      where: {
        trainerId: slot.trainerId,
        athleteId: slot.athleteId,
        scheduledAt,
        cancelled: false,
      },
    })
    if (existing) {
      skipped.push({ date: ymd, reason: 'Session already exists.' })
      continue
    }

    const validation = await validateBooking(gymId, {
      trainerId: slot.trainerId,
      athleteId: slot.athleteId,
      scheduledAt,
      duration: slot.duration,
    })
    if (!validation.ok) {
      skipped.push({
        date: ymd,
        reason: validation.conflicts[0]?.message ?? 'Conflict.',
      })
      continue
    }
    const session = await db.session.create({
      data: {
        gymId,
        trainerId: slot.trainerId,
        athleteId: slot.athleteId,
        scheduledAt,
        duration: slot.duration,
        notes: slot.notes ? `Standing: ${slot.notes}` : 'Standing weekly',
      },
    })
    created.push({ sessionId: session.id, scheduledAt: scheduledAt.toISOString() })
  }

  return { created, skipped }
}

export { DEFAULT_GYM_ID }
