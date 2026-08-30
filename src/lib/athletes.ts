// Athlete lifecycle: archive, restore, and permanent delete.
//
// Archive is the normal way to remove someone from the gym — they vanish from
// rosters and can't log in, but their history stays intact. Permanent delete
// exists for genuine mistakes (duplicate signups, test rows, erasure requests)
// and is deliberately harder to reach.
//
// This logic used to live only inside the AI chat tool (`archive_athlete`), so
// the admin UI had no way to do it. It lives here now and the chat tool is a
// thin wrapper, so both surfaces behave identically.

import { db } from '@/lib/db'

export interface ArchiveResult {
  ok: true
  athleteName: string
  sessionsCancelled: number
  attendeeRowsRemoved: number
}

/**
 * Archive an athlete. Group-aware: if they're one of several attendees on a
 * session, they're dropped from that session's roster and the session goes
 * ahead for everyone else. Only sessions that are theirs alone get cancelled.
 */
export async function archiveAthlete(
  gymId: string,
  athleteId: string,
  opts: { cancelFutureSessions?: boolean } = {}
): Promise<ArchiveResult | { error: string }> {
  const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete || athlete.gymId !== gymId) {
    return { error: 'Athlete not found.' }
  }

  const cancelFuture = opts.cancelFutureSessions !== false
  let cancelled = 0
  let removed = 0

  await db.athlete.update({ where: { id: athleteId }, data: { archived: true } })

  if (cancelFuture) {
    const sessions = await db.session.findMany({
      where: {
        cancelled: false,
        scheduledAt: { gte: new Date() },
        OR: [{ athleteId }, { attendees: { some: { athleteId } } }],
      },
      include: { attendees: true },
    })
    for (const s of sessions) {
      const otherAttendees = s.attendees.filter((a) => a.athleteId !== athleteId)
      if (otherAttendees.length > 0 && s.athleteId !== athleteId) {
        await db.sessionAttendee.deleteMany({ where: { sessionId: s.id, athleteId } })
        removed++
      } else {
        await db.session.update({ where: { id: s.id }, data: { cancelled: true } })
        cancelled++
      }
    }
  }

  return {
    ok: true,
    athleteName: `${athlete.firstName} ${athlete.lastName}`,
    sessionsCancelled: cancelled,
    attendeeRowsRemoved: removed,
  }
}

export async function unarchiveAthlete(
  gymId: string,
  athleteId: string
): Promise<{ ok: true; athleteName: string } | { error: string }> {
  const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete || athlete.gymId !== gymId) {
    return { error: 'Athlete not found.' }
  }
  await db.athlete.update({ where: { id: athleteId }, data: { archived: false } })
  return { ok: true, athleteName: `${athlete.firstName} ${athlete.lastName}` }
}

export interface DeleteResult {
  ok: true
  athleteName: string
  sessionsDeleted: number
  sessionsReassigned: number
  checkInsDeleted: number
}

/**
 * Permanently delete an athlete and their personal records.
 *
 * Cascades handle SessionAttendee, AthleteStandingSlot, BookingRequest and the
 * OAuth tables. Three things do NOT cascade and are handled explicitly:
 *
 *  - Session.athlete and CheckIn.athlete are RESTRICT, so they'd block the
 *    delete outright.
 *  - A group session whose *primary* athleteId is the person being deleted
 *    must not disappear — the rest of the group still trains. Those sessions
 *    are handed to another attendee instead.
 *  - WaiverSignature is deliberately left behind. It's a signed legal record
 *    and its athleteId is a bare string with no FK, so orphaning is intended.
 */
export async function deleteAthletePermanently(
  gymId: string,
  athleteId: string
): Promise<DeleteResult | { error: string }> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    include: { sessions: { include: { attendees: true } } },
  })
  if (!athlete || athlete.gymId !== gymId) {
    return { error: 'Athlete not found.' }
  }

  const name = `${athlete.firstName} ${athlete.lastName}`
  let reassigned = 0
  let deleted = 0

  // Sessions where this athlete is the primary row. If other people are on the
  // session, it survives with a new primary; otherwise it goes.
  const primarySessions = await db.session.findMany({
    where: { athleteId },
    include: { attendees: true },
  })
  const toDelete: string[] = []
  const toReassign: { id: string; newAthleteId: string }[] = []
  for (const s of primarySessions) {
    const other = s.attendees.find((a) => a.athleteId !== athleteId)
    if (other) toReassign.push({ id: s.id, newAthleteId: other.athleteId })
    else toDelete.push(s.id)
  }

  const checkInCount = await db.checkIn.count({ where: { athleteId } })

  await db.$transaction(async (tx) => {
    for (const r of toReassign) {
      await tx.session.update({
        where: { id: r.id },
        data: { athleteId: r.newAthleteId },
      })
    }
    reassigned = toReassign.length

    // CheckIn has no cascade from Athlete, and CheckIn.sessionId is unique —
    // clear these before the sessions they point at.
    await tx.checkIn.deleteMany({ where: { athleteId } })

    if (toDelete.length > 0) {
      // BookingRequest.sessionId has no cascade; unpoint it before deleting.
      await tx.bookingRequest.updateMany({
        where: { sessionId: { in: toDelete } },
        data: { sessionId: null },
      })
      await tx.checkIn.deleteMany({ where: { sessionId: { in: toDelete } } })
      await tx.session.deleteMany({ where: { id: { in: toDelete } } })
      deleted = toDelete.length
    }

    await tx.athlete.delete({ where: { id: athleteId } })
  })

  return {
    ok: true,
    athleteName: name,
    sessionsDeleted: deleted,
    sessionsReassigned: reassigned,
    checkInsDeleted: checkInCount,
  }
}
