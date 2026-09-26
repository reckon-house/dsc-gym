// Attendance reporting.
//
// A note on what these numbers mean, because it matters and the gym should
// not be misled by its own report.
//
// There are three possible signals for "did this athlete turn up":
//   1. SessionAttendee rows on a past, uncancelled session — they were on the
//      roster for something that happened.
//   2. CheckIn rows — they physically scanned in at the kiosk.
//   3. Session.completed — a coach marked the session done.
//
// In this gym only (1) has data: 211 attendee rows against 3 check-ins and
// zero completed sessions. So the headline number is SCHEDULED attendance,
// and check-ins are reported alongside rather than folded in, so the gap is
// visible instead of quietly overstating the total. If the kiosk ever gets
// used, the same report starts showing real arrivals next to expectations
// without any change here.

import { db } from '@/lib/db'
import { formatInZone } from '@/lib/scheduling/timezone'
import { getGymTimezone } from '@/lib/scheduling/engine'

export interface AttendanceRow {
  athleteId: string
  name: string
  /** Past, uncancelled sessions this athlete was on the roster for. */
  sessions: number
  /** Physical kiosk check-ins in the same window. */
  checkIns: number
  /** Marked no-show by a coach. Not counted in `sessions`. */
  noShows: number
  /** Distinct coaches they trained with. */
  coaches: string[]
  lastSession: string | null
}

export interface AttendanceReport {
  from: string
  to: string
  label: string
  rows: AttendanceRow[]
  totals: {
    athletes: number
    sessions: number
    attendances: number
    checkIns: number
  }
  /** Stated in the response so a reader cannot mistake one signal for another. */
  basis: string
}

/**
 * Roll up attendance between two instants.
 *
 * Only counts sessions that have already STARTED — a report covering "this
 * week" on a Wednesday should not credit an athlete for Friday's session.
 */
export async function attendanceReport(
  gymId: string,
  from: Date,
  to: Date,
  label: string
): Promise<AttendanceReport> {
  const zone = await getGymTimezone(gymId)
  const now = new Date()
  const upper = to.getTime() < now.getTime() ? to : now

  const sessions = await db.session.findMany({
    where: {
      gymId,
      cancelled: false,
      scheduledAt: { gte: from, lt: upper },
    },
    include: {
      attendees: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true, archived: true } } },
      },
      trainer: { include: { user: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  const checkIns = await db.checkIn.groupBy({
    by: ['athleteId'],
    where: { gymId, checkInTime: { gte: from, lt: upper } },
    _count: { _all: true },
  })
  const checkInBy = new Map(checkIns.map((c) => [c.athleteId, c._count._all]))

  const byAthlete = new Map<string, AttendanceRow & { coachSet: Set<string> }>()
  let attendances = 0

  for (const s of sessions) {
    for (const a of s.attendees) {
      if (a.athlete.archived) continue
      if (a.status === 'no_show') {
        const row = byAthlete.get(a.athleteId)
        if (row) row.noShows++
        else
          byAthlete.set(a.athleteId, {
            athleteId: a.athleteId,
            name: `${a.athlete.firstName} ${a.athlete.lastName}`,
            sessions: 0,
            noShows: 1,
            checkIns: checkInBy.get(a.athleteId) ?? 0,
            coaches: [],
            lastSession: null,
            coachSet: new Set<string>(),
          })
        continue
      }
      attendances++
      const existing =
        byAthlete.get(a.athleteId) ??
        {
          athleteId: a.athleteId,
          name: `${a.athlete.firstName} ${a.athlete.lastName}`,
          sessions: 0,
          noShows: 0,
          checkIns: checkInBy.get(a.athleteId) ?? 0,
          coaches: [],
          lastSession: null,
          coachSet: new Set<string>(),
        }
      existing.sessions++
      existing.coachSet.add(s.trainer.user.name)
      existing.lastSession = formatInZone(s.scheduledAt, zone, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      byAthlete.set(a.athleteId, existing)
    }
  }

  const rows: AttendanceRow[] = [...byAthlete.values()]
    .map(({ coachSet, ...r }) => ({ ...r, coaches: [...coachSet].sort() }))
    .filter((r) => r.sessions > 0 || r.noShows > 0)
    // Most frequent first — the question is usually "who is here a lot" or
    // "who has dropped off", and both are answered from the ends of this list.
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))

  return {
    from: formatInZone(from, zone, { month: 'short', day: 'numeric' }),
    to: formatInZone(upper, zone, { month: 'short', day: 'numeric' }),
    label,
    rows,
    totals: {
      athletes: rows.length,
      sessions: sessions.length,
      attendances,
      checkIns: [...checkInBy.values()].reduce((n, x) => n + x, 0),
    },
    basis:
      'Counts sessions the athlete attended. Where a coach took attendance, no-shows are excluded and counted separately; where attendance was never taken, being on the roster is counted as attending. Kiosk check-ins are listed separately.',
  }
}

/** Monday-to-now of the current week, in the gym's zone. */
export function thisWeek(zone: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now)
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts)
  const daysSinceMonday = (idx + 6) % 7
  const from = new Date(now)
  from.setDate(from.getDate() - daysSinceMonday)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 7)
  return { from, to, label: 'This week' }
}

/** The calendar month containing `ref`. */
export function monthRange(ref: Date): { from: Date; to: Date; label: string } {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
  return {
    from,
    to,
    label: from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}
