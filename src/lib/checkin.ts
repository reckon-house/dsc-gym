// Staff check-in: tap a name, they're recorded as here.
//
// The kiosk flow (/api/checkin) matches by email and only knows about a
// session's first athlete. This is the front-desk version for athletes who are
// already registered, and it feeds attendance properly: if the athlete is on a
// session today, they're marked present on that session's roster, so the
// coach's attendance sheet opens with them already ticked.

import { db } from '@/lib/db'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { endOfDayInZone, formatTime, startOfDayInZone } from '@/lib/scheduling/timezone'
import { rosterLabel, sessionRoster } from '@/lib/sessionRoster'

/** A second tap within this window is the same visit, not a new one. */
const REPEAT_MINUTES = 90

export interface CheckInResult {
  ok: boolean
  error?: string
  checkInId?: string
  name?: string
  already?: boolean
  /** "4:00pm Basketball Group", or null when they had nothing booked. */
  session?: string | null
  sessionRecord?: { id: string; scheduledAt: Date; duration: number } | null
  checkInTime?: Date
}

export async function staffCheckIn(
  gymId: string,
  athleteId: string,
  /** null = the self-serve kiosk. */
  byUserId: string | null,
  now: Date = new Date()
): Promise<CheckInResult> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, gymId: true, firstName: true, lastName: true, archived: true },
  })
  if (!athlete || athlete.gymId !== gymId) return { ok: false, error: 'Athlete not found.' }
  if (athlete.archived) return { ok: false, error: `${athlete.firstName} is archived.` }
  const name = `${athlete.firstName} ${athlete.lastName}`

  const recent = await db.checkIn.findFirst({
    where: { athleteId, checkInTime: { gte: new Date(now.getTime() - REPEAT_MINUTES * 60_000) } },
    orderBy: { checkInTime: 'desc' },
  })
  if (recent) {
    return { ok: true, already: true, checkInId: recent.id, name, checkInTime: recent.checkInTime, sessionRecord: null }
  }

  const zone = await getGymTimezone(gymId)
  // Sessions today the athlete is ON THE ROSTER of — not just the ones where
  // they happen to be the first name, which is all the kiosk ever checked.
  const today = await db.session.findMany({
    where: {
      gymId,
      cancelled: false,
      scheduledAt: { gte: startOfDayInZone(now, zone), lt: endOfDayInZone(now, zone) },
      attendees: { some: { athleteId } },
    },
    include: {
      attendees: { include: { athlete: { select: { firstName: true, lastName: true } } } },
      group: { select: { name: true } },
    },
  })
  // The one closest to now: someone arriving at 3:50 is here for the 4:00.
  const session = today.sort(
    (a, b) => Math.abs(a.scheduledAt.getTime() - now.getTime()) - Math.abs(b.scheduledAt.getTime() - now.getTime())
  )[0]

  const checkIn = await db.checkIn.create({
    data: {
      gymId,
      athleteId,
      sessionId: session?.id ?? null,
      matched: Boolean(session),
      checkedInById: byUserId,
      checkInTime: now,
    },
  })

  if (session) {
    // Only fill in a blank. If a coach already marked them, theirs stands.
    await db.sessionAttendee.updateMany({
      where: { sessionId: session.id, athleteId, status: null },
      data: { status: 'present', markedAt: now, markedById: byUserId },
    })
  }

  return {
    ok: true,
    checkInId: checkIn.id,
    name,
    session: session
      ? `${formatTime(session.scheduledAt, zone)} ${rosterLabel(sessionRoster(session), session.group?.name)}`
      : null,
    sessionRecord: session ? { id: session.id, scheduledAt: session.scheduledAt, duration: session.duration } : null,
    checkInTime: checkIn.checkInTime,
  }
}

/** Undo a mis-tap. Clears the "present" it set, unless attendance was since taken. */
export async function undoCheckIn(gymId: string, checkInId: string) {
  const c = await db.checkIn.findUnique({ where: { id: checkInId } })
  if (!c || c.gymId !== gymId) return { ok: false as const, error: 'Check-in not found.' }
  await db.$transaction(async (tx) => {
    if (c.sessionId) {
      const s = await tx.session.findUnique({ where: { id: c.sessionId }, select: { attendanceTakenAt: true } })
      if (s && !s.attendanceTakenAt) {
        await tx.sessionAttendee.updateMany({
          where: { sessionId: c.sessionId, athleteId: c.athleteId, status: 'present', markedAt: c.checkInTime },
          data: { status: null, markedAt: null, markedById: null },
        })
      }
    }
    await tx.checkIn.delete({ where: { id: checkInId } })
  })
  return { ok: true as const }
}

/** Today's check-ins, newest first, for the list under the search box. */
export async function todaysCheckIns(gymId: string, now: Date = new Date()) {
  const zone = await getGymTimezone(gymId)
  const rows = await db.checkIn.findMany({
    where: { gymId, checkInTime: { gte: startOfDayInZone(now, zone), lt: endOfDayInZone(now, zone) } },
    include: {
      athlete: { select: { id: true, firstName: true, lastName: true } },
      session: { include: { group: { select: { name: true } } } },
    },
    orderBy: { checkInTime: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    athleteId: r.athlete.id,
    name: `${r.athlete.firstName} ${r.athlete.lastName}`,
    time: formatTime(r.checkInTime, zone),
    session: r.session ? `${formatTime(r.session.scheduledAt, zone)}${r.session.group ? ` ${r.session.group.name}` : ''}` : null,
    kiosk: r.checkedInById === null,
  }))
}
