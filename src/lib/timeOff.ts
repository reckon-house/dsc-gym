// Coach time off: request → owner approves → the days are blocked.
//
// Blocking reuses AvailabilityException rather than inventing a second kind of
// "unavailable". The booking engine, the slot finder and the chat scheduler all
// already respect exceptions, so an approved request stops new bookings
// everywhere at once. What approval does NOT do is touch sessions already on
// the books — it reports them, and a person decides whether to move, reassign
// or cancel each one. Silently cancelling a family's session because a coach
// asked for the day off is not a call software should make.

import { db } from '@/lib/db'
import { getGymTimezone } from '@/lib/scheduling/engine'
import {
  dateOnlyInZone,
  formatHuman,
  minutesToHHMM,
} from '@/lib/scheduling/timezone'
import { describeOccupant } from '@/lib/sessionRoster'

export type TimeOffStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

/** Longest single request. A season off is a staffing change, not time off. */
const MAX_DAYS = 60

export interface TimeOffInput {
  gymId: string
  trainerId: string
  startYMD: string
  endYMD: string
  startMinute?: number | null
  endMinute?: number | null
  reason?: string | null
  requestedById: string
}

/** YYYY-MM-DD → the @db.Date value (UTC midnight), as exceptions store it. */
function dbDate(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400_000) out.push(new Date(t))
  return out
}

export function validateTimeOff(
  input: Pick<TimeOffInput, 'startYMD' | 'endYMD' | 'startMinute' | 'endMinute'>
):
  | { ok: true; start: Date; end: Date; startMinute: number | null; endMinute: number | null }
  | { ok: false; error: string } {
  const start = dbDate(input.startYMD)
  const end = dbDate(input.endYMD || input.startYMD)
  if (!start || !end) return { ok: false, error: 'Pick a start and end date.' }
  if (end < start) return { ok: false, error: 'The end date is before the start date.' }
  const days = Math.round((end.getTime() - start.getTime()) / 86400_000) + 1
  if (days > MAX_DAYS) return { ok: false, error: `That's ${days} days — the most in one request is ${MAX_DAYS}.` }

  const sm = input.startMinute ?? null
  const em = input.endMinute ?? null
  if ((sm === null) !== (em === null)) return { ok: false, error: 'Give both a start and end time, or neither.' }
  if (sm !== null && em !== null) {
    if (days > 1) return { ok: false, error: 'Part-day time off has to be a single day.' }
    if (sm < 0 || em > 24 * 60 || em <= sm) return { ok: false, error: 'The end time must be after the start time.' }
  }
  return { ok: true, start, end, startMinute: sm, endMinute: em }
}

/** The sessions a coach is on during a window: what approval would leave stranded. */
export async function sessionsDuring(
  gymId: string,
  trainerId: string,
  start: Date,
  end: Date,
  startMinute: number | null,
  endMinute: number | null
) {
  const zone = await getGymTimezone(gymId)
  const from = dateOnlyInZone(ymd(start), zone)!
  const lastDay = dateOnlyInZone(ymd(end), zone)!
  const windowStart = startMinute !== null ? new Date(from.getTime() + startMinute * 60_000) : from
  const windowEnd =
    endMinute !== null
      ? new Date(from.getTime() + endMinute * 60_000)
      : new Date(lastDay.getTime() + 86400_000)

  const sessions = await db.session.findMany({
    where: {
      gymId,
      cancelled: false,
      scheduledAt: { lt: windowEnd },
      OR: [{ trainerId }, { coaches: { some: { trainerId } } }],
    },
    include: {
      athlete: true,
      attendees: { include: { athlete: true } },
      group: { select: { name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
  return sessions
    .filter((s) => s.scheduledAt.getTime() + s.duration * 60_000 > windowStart.getTime())
    .map((s) => ({
      id: s.id,
      at: s.scheduledAt.toISOString(),
      when: formatHuman(s.scheduledAt, zone),
      who: describeOccupant(s),
      lead: s.trainerId === trainerId,
    }))
}

export async function requestTimeOff(input: TimeOffInput) {
  const v = validateTimeOff(input)
  if (!v.ok) return v
  const trainer = await db.trainer.findUnique({
    where: { id: input.trainerId },
    select: { id: true, gymId: true, user: { select: { name: true } } },
  })
  if (!trainer || trainer.gymId !== input.gymId) return { ok: false as const, error: 'Coach not found.' }

  // One open request per window. Tapping submit twice should not make two.
  const dup = await db.timeOffRequest.findFirst({
    where: {
      trainerId: input.trainerId,
      status: { in: ['pending', 'approved'] },
      startDate: v.start,
      endDate: v.end,
      startMinute: v.startMinute,
      endMinute: v.endMinute,
    },
  })
  if (dup) return { ok: true as const, request: dup, duplicate: true }

  const reason = (input.reason ?? '').trim().slice(0, 300) || null
  const request = await db.timeOffRequest.create({
    data: {
      gymId: input.gymId,
      trainerId: input.trainerId,
      startDate: v.start,
      endDate: v.end,
      startMinute: v.startMinute,
      endMinute: v.endMinute,
      reason,
      requestedById: input.requestedById,
    },
  })
  return { ok: true as const, request, duplicate: false }
}

export async function approveTimeOff(id: string, gymId: string, byUserId: string, note?: string | null) {
  const req = await db.timeOffRequest.findUnique({ where: { id } })
  if (!req || req.gymId !== gymId) return { ok: false as const, error: 'Request not found.' }
  if (req.status !== 'pending') return { ok: false as const, error: `That request is already ${req.status}.` }

  const label = `Time off${req.reason ? `: ${req.reason}` : ''}`
  const result = await db.$transaction(async (tx) => {
    // Claim it first so two admins approving at once can't both create rows.
    const claimed = await tx.timeOffRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'approved', decidedById: byUserId, decidedAt: new Date(), decisionNote: note ?? null },
    })
    if (claimed.count === 0) return null
    const ids: string[] = []
    for (const day of eachDay(req.startDate, req.endDate)) {
      const ex = await tx.availabilityException.create({
        data: {
          trainerId: req.trainerId,
          date: day,
          isAvailable: false,
          startMinute: req.startMinute,
          endMinute: req.endMinute,
          reason: label,
        },
      })
      ids.push(ex.id)
    }
    return tx.timeOffRequest.update({ where: { id }, data: { exceptionIds: ids } })
  })
  if (!result) return { ok: false as const, error: 'Someone else already decided that request.' }

  const stranded = await sessionsDuring(
    gymId,
    req.trainerId,
    req.startDate,
    req.endDate,
    req.startMinute,
    req.endMinute
  )
  return { ok: true as const, request: result, stranded }
}

export async function declineTimeOff(id: string, gymId: string, byUserId: string, note?: string | null) {
  const req = await db.timeOffRequest.findUnique({ where: { id } })
  if (!req || req.gymId !== gymId) return { ok: false as const, error: 'Request not found.' }
  const updated = await db.timeOffRequest.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'declined', decidedById: byUserId, decidedAt: new Date(), decisionNote: note ?? null },
  })
  if (updated.count === 0) return { ok: false as const, error: `That request is already ${req.status}.` }
  return { ok: true as const }
}

/**
 * Withdraw a request. A coach can withdraw their own pending one; an admin can
 * also cancel an approved one, which unblocks exactly the days it blocked.
 */
export async function cancelTimeOff(
  id: string,
  actor: { role: 'ADMIN' | 'TRAINER'; trainerId?: string; gymId: string }
) {
  const req = await db.timeOffRequest.findUnique({ where: { id } })
  if (!req || req.gymId !== actor.gymId) return { ok: false as const, error: 'Request not found.' }
  if (actor.role !== 'ADMIN') {
    if (req.trainerId !== actor.trainerId) return { ok: false as const, error: 'Not your request.' }
    if (req.status !== 'pending') {
      return { ok: false as const, error: 'It has already been decided — ask Jordan or Scott to change it.' }
    }
  }
  if (req.status !== 'pending' && req.status !== 'approved') {
    return { ok: false as const, error: `That request is already ${req.status}.` }
  }
  await db.$transaction([
    db.availabilityException.deleteMany({ where: { id: { in: req.exceptionIds } } }),
    db.timeOffRequest.update({ where: { id }, data: { status: 'cancelled', exceptionIds: [] } }),
  ])
  return { ok: true as const }
}

export async function listTimeOff(
  gymId: string,
  opts: { trainerId?: string; status?: TimeOffStatus[]; from?: Date; to?: Date } = {}
) {
  const rows = await db.timeOffRequest.findMany({
    where: {
      gymId,
      ...(opts.trainerId ? { trainerId: opts.trainerId } : {}),
      ...(opts.status ? { status: { in: opts.status } } : {}),
      // Overlap with [from, to].
      ...(opts.to ? { startDate: { lte: opts.to } } : {}),
      ...(opts.from ? { endDate: { gte: opts.from } } : {}),
    },
    include: { trainer: { select: { user: { select: { name: true } } } } },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    trainerId: r.trainerId,
    trainerName: r.trainer.user.name,
    startDate: ymd(r.startDate),
    endDate: ymd(r.endDate),
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    label: describeTimeOff(r),
    reason: r.reason,
    status: r.status as TimeOffStatus,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(d: Date): string {
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function clock(min: number): string {
  const [h, m] = minutesToHHMM(min).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`
}

/** "Fri Oct 3", "Fri Oct 3 – Mon Oct 6", "Fri Oct 3, 2pm–5pm". */
export function describeTimeOff(r: {
  startDate: Date
  endDate: Date
  startMinute: number | null
  endMinute: number | null
}): string {
  const same = r.startDate.getTime() === r.endDate.getTime()
  const days = same ? dayLabel(r.startDate) : `${dayLabel(r.startDate)} – ${dayLabel(r.endDate)}`
  if (r.startMinute !== null && r.endMinute !== null) {
    return `${days}, ${clock(r.startMinute)}–${clock(r.endMinute)}`
  }
  return days
}
