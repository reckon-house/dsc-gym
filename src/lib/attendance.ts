// Attendance: who actually came, as opposed to who was booked.
//
// Before this, the app only knew the plan. Three kiosk check-ins had ever been
// recorded and no session had ever been marked complete, so "hasn't been in
// for two weeks" could only mean "hasn't been SCHEDULED for two weeks" — which
// flagged two thirds of the roster and would have been ignored within a week.
//
// Taking attendance is designed around one fact: coaches will only do it if it
// is almost no work. So the default is present. A coach taps the kids who did
// NOT come, adds anyone who turned up unbooked, and saves — everyone they
// didn't touch is recorded as there.

import { db } from '@/lib/db'
import { addSessionAttendee } from '@/lib/scheduling/engine'

export type AttendanceStatus = 'present' | 'no_show'

/** How early before the start a coach may take attendance. */
const EARLY_MINUTES = 60

export interface Actor {
  userId: string
  role: 'ADMIN' | 'TRAINER'
  trainerId?: string
}

/**
 * Admins can take attendance for anything. A trainer can take it for sessions
 * they lead or assist on — the assisting coach is often the one with the
 * clipboard in a group class.
 */
export async function canTakeAttendance(sessionId: string, actor: Actor): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  if (!actor.trainerId) return false
  const s = await db.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, coaches: { select: { trainerId: true } } },
  })
  if (!s) return false
  return s.trainerId === actor.trainerId || s.coaches.some((c) => c.trainerId === actor.trainerId)
}

export interface AttendanceInput {
  gymId: string
  sessionId: string
  /** Explicit marks. Anyone on the roster not listed gets `defaultStatus`. */
  marks?: { athleteId: string; status: AttendanceStatus }[]
  /** Athletes who came without being booked. Added to the roster as present. */
  dropIns?: string[]
  defaultStatus?: AttendanceStatus
  byUserId: string
}

export interface AttendanceResult {
  ok: boolean
  error?: string
  present?: string[]
  noShow?: string[]
  dropIns?: string[]
}

export async function recordAttendance(input: AttendanceInput): Promise<AttendanceResult> {
  const session = await db.session.findUnique({
    where: { id: input.sessionId },
    include: { attendees: true },
  })
  if (!session || session.gymId !== input.gymId) return { ok: false, error: 'Session not found.' }
  if (session.cancelled) return { ok: false, error: 'That session was cancelled.' }
  if (session.scheduledAt.getTime() > Date.now() + EARLY_MINUTES * 60_000) {
    return { ok: false, error: "That session hasn't started yet — attendance opens an hour before." }
  }

  // Drop-ins first, through the same path as any other roster add, so the
  // "already somewhere else at that time" check still applies.
  const dropInIds: string[] = []
  for (const athleteId of input.dropIns ?? []) {
    if (session.attendees.some((a) => a.athleteId === athleteId)) continue
    const r = await addSessionAttendee(input.gymId, input.sessionId, athleteId)
    if (!r.ok) return { ok: false, error: r.error }
    dropInIds.push(athleteId)
  }

  const roster = await db.sessionAttendee.findMany({
    where: { sessionId: input.sessionId },
    include: { athlete: { select: { firstName: true, lastName: true } } },
  })
  const explicit = new Map((input.marks ?? []).map((m) => [m.athleteId, m.status]))
  for (const id of explicit.keys()) {
    if (!roster.some((r) => r.athleteId === id)) {
      return { ok: false, error: 'One of those athletes is not on this session.' }
    }
  }

  const now = new Date()
  const fallback: AttendanceStatus = input.defaultStatus ?? 'present'
  const present: string[] = []
  const noShow: string[] = []

  await db.$transaction([
    ...roster.map((r) => {
      const isDropIn = dropInIds.includes(r.athleteId)
      const status: AttendanceStatus = isDropIn ? 'present' : (explicit.get(r.athleteId) ?? fallback)
      const name = `${r.athlete.firstName} ${r.athlete.lastName}`
      if (status === 'present') present.push(name)
      else noShow.push(name)
      return db.sessionAttendee.update({
        where: { id: r.id },
        data: {
          status,
          ...(isDropIn ? { dropIn: true } : {}),
          markedAt: now,
          markedById: input.byUserId,
        },
      })
    }),
    db.session.update({
      where: { id: input.sessionId },
      data: {
        attendanceTakenAt: now,
        attendanceTakenById: input.byUserId,
        // The old "complete" flag was never used; attendance is what it meant.
        completed: true,
        completedAt: now,
      },
    }),
  ])

  const dropInNames = roster
    .filter((r) => dropInIds.includes(r.athleteId))
    .map((r) => `${r.athlete.firstName} ${r.athlete.lastName}`)

  return { ok: true, present, noShow, dropIns: dropInNames }
}

export interface AbsentRow {
  athleteId: string
  name: string
  lastSeen: string
  daysAway: number
  /** False when lastSeen comes from a session nobody took attendance for. */
  confirmed: boolean
  nextSession: string | null
  recentNoShows: number
}

/**
 * Active athletes nobody has seen in `days` days.
 *
 * "Seen" means: marked present, checked in at the kiosk, or on a past session
 * whose attendance was never taken. That last one is an assumption, and it is
 * deliberate — until coaches are in the habit of marking, treating unrecorded
 * sessions as absences would flag most of the gym. Each row says whether its
 * last visit was confirmed, and the assumption quietly stops mattering as
 * attendance gets taken.
 *
 * Athletes with no history at all are left out: a brand-new signup who hasn't
 * booked yet is a different conversation from someone who stopped coming.
 */
/** Past this, someone has left rather than slipped — a different conversation. */
export const LAPSED_DAYS = 90

export async function absentAthletes(
  gymId: string,
  days = 14,
  now: Date = new Date()
): Promise<{ rows: AbsentRow[]; neverSeen: number; lapsed: number }> {
  const cutoff = new Date(now.getTime() - days * 86400_000)

  const [athletes, attendance, checkIns, upcoming] = await Promise.all([
    db.athlete.findMany({
      where: { gymId, archived: false },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.sessionAttendee.findMany({
      where: { session: { gymId, cancelled: false, scheduledAt: { lt: now } } },
      select: { athleteId: true, status: true, session: { select: { scheduledAt: true } } },
    }),
    db.checkIn.findMany({
      where: { gymId },
      select: { athleteId: true, checkInTime: true },
    }),
    db.sessionAttendee.findMany({
      where: { session: { gymId, cancelled: false, scheduledAt: { gte: now } } },
      select: { athleteId: true, session: { select: { scheduledAt: true } } },
      orderBy: { session: { scheduledAt: 'asc' } },
    }),
  ])

  const seen = new Map<string, { at: Date; confirmed: boolean }>()
  const bump = (id: string, at: Date, confirmed: boolean) => {
    const cur = seen.get(id)
    if (!cur || at > cur.at || (at.getTime() === cur.at.getTime() && confirmed)) {
      seen.set(id, { at, confirmed })
    }
  }
  const noShowsSince = new Map<string, number>()
  for (const a of attendance) {
    if (a.status === 'no_show') {
      if (a.session.scheduledAt >= cutoff) {
        noShowsSince.set(a.athleteId, (noShowsSince.get(a.athleteId) ?? 0) + 1)
      }
      continue
    }
    bump(a.athleteId, a.session.scheduledAt, a.status === 'present')
  }
  for (const c of checkIns) bump(c.athleteId, c.checkInTime, true)

  const next = new Map<string, Date>()
  for (const u of upcoming) if (!next.has(u.athleteId)) next.set(u.athleteId, u.session.scheduledAt)

  const rows: AbsentRow[] = []
  let neverSeen = 0
  let lapsed = 0
  for (const a of athletes) {
    const s = seen.get(a.id)
    if (!s) {
      neverSeen++
      continue
    }
    if (s.at >= cutoff) continue
    const daysAway = Math.floor((now.getTime() - s.at.getTime()) / 86400_000)
    if (daysAway > LAPSED_DAYS && !next.has(a.id)) {
      lapsed++
      continue
    }
    rows.push({
      athleteId: a.id,
      name: `${a.firstName} ${a.lastName}`,
      lastSeen: s.at.toISOString(),
      daysAway,
      confirmed: s.confirmed,
      nextSession: next.get(a.id)?.toISOString() ?? null,
      recentNoShows: noShowsSince.get(a.id) ?? 0,
    })
  }
  // Most recent drop-off first. Someone two weeks out is the one a phone call
  // can still bring back; the long gaps are further down, and anyone gone past
  // LAPSED_DAYS with nothing booked is counted separately rather than listed.
  rows.sort((x, y) => x.daysAway - y.daysAway)
  return { rows, neverSeen, lapsed }
}

export interface Visit {
  sessionId: string
  at: string
  duration: number
  coach: string
  groupName: string | null
  /** present | no_show | not_recorded | checked_in */
  status: 'present' | 'no_show' | 'not_recorded' | 'checked_in'
  dropIn: boolean
}

/** One athlete's visits, newest first, with a summary. */
export async function visitHistory(athleteId: string, limit = 60) {
  const now = new Date()
  const [rows, kiosk] = await Promise.all([
    db.sessionAttendee.findMany({
      where: { athleteId, session: { cancelled: false, scheduledAt: { lt: now } } },
      include: {
        session: {
          select: {
            id: true,
            scheduledAt: true,
            duration: true,
            trainer: { select: { user: { select: { name: true } } } },
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { session: { scheduledAt: 'desc' } },
      take: limit,
    }),
    // Kiosk check-ins with no session attached are visits too.
    db.checkIn.findMany({
      where: { athleteId, sessionId: null },
      orderBy: { checkInTime: 'desc' },
      take: limit,
    }),
  ])

  const visits: Visit[] = [
    ...rows.map((r) => ({
      sessionId: r.session.id,
      at: r.session.scheduledAt.toISOString(),
      duration: r.session.duration,
      coach: r.session.trainer.user.name,
      groupName: r.session.group?.name ?? null,
      status: (r.status as Visit['status'] | null) ?? 'not_recorded',
      dropIn: r.dropIn,
    })),
    ...kiosk.map((c) => ({
      sessionId: c.id,
      at: c.checkInTime.toISOString(),
      duration: 0,
      coach: '—',
      groupName: null,
      status: 'checked_in' as const,
      dropIn: false,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)

  const summary = {
    attended: visits.filter((v) => v.status === 'present' || v.status === 'checked_in').length,
    noShows: visits.filter((v) => v.status === 'no_show').length,
    notRecorded: visits.filter((v) => v.status === 'not_recorded').length,
    dropIns: visits.filter((v) => v.dropIn).length,
    lastAttended: visits.find((v) => v.status === 'present' || v.status === 'checked_in')?.at ?? null,
  }
  return { visits, summary }
}

/**
 * Sessions a coach still owes attendance on: started, not cancelled, not yet
 * taken, within the last `days` days. What turns "please take attendance"
 * from a request into a visible to-do.
 */
export async function attendanceOwed(
  gymId: string,
  trainerId: string | null,
  days = 14,
  now: Date = new Date()
) {
  const since = new Date(now.getTime() - days * 86400_000)
  return db.session.findMany({
    where: {
      gymId,
      cancelled: false,
      attendanceTakenAt: null,
      scheduledAt: { gte: since, lte: now },
      // Open classes nobody joined have nothing to mark.
      attendees: { some: {} },
      ...(trainerId
        ? { OR: [{ trainerId }, { coaches: { some: { trainerId } } }] }
        : {}),
    },
    include: {
      attendees: { include: { athlete: { select: { id: true, firstName: true, lastName: true } } } },
      trainer: { select: { user: { select: { name: true } } } },
      group: { select: { name: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  })
}
