// Open groups: classes that sit on the schedule before anyone has joined.
//
// The problem this solves: a group used to need members before it could reach
// the calendar, so a new gym showed families a blank week and there was nothing
// to sign up FOR. Chicken and egg.
//
// The fix is to stop treating "on the schedule" and "has bookings" as the same
// thing. A group with a weekly day and time is already a complete description
// of a recurring class — "Basketball, Mondays at 11, 60 minutes" is true
// whether or not a single athlete has enrolled. So the browse view PROJECTS
// those occurrences from the group's rule instead of reading Session rows, and
// real Sessions get created only once somebody is actually in it.
//
// That is deliberately not the other obvious approach, which was to make
// Session.athleteId nullable so empty sessions could exist. That FK is read in
// 50-odd places; making it optional would force every one of them to handle a
// session with nobody in it, forever, to buy a placeholder.

import { db } from '@/lib/db'
import { getGymTimezone, materializeGroup } from '@/lib/scheduling/engine'
import { partsInZone, startOfDayInZone } from '@/lib/scheduling/timezone'

/** How far ahead the browse view looks. */
export const BROWSE_WEEKS = 6

/** How many weeks get real Sessions when a group first gains a member. */
export const MATERIALIZE_WEEKS = 8

export interface GroupOccurrence {
  /** Stable per occurrence, so the UI can key on it without a Session row. */
  key: string
  startsAt: string
  duration: number
  /** Set once this week has a real Session; null while it is only projected. */
  sessionId: string | null
}

export interface OpenGroupView {
  id: string
  name: string
  description: string | null
  dayOfWeek: number
  startMinute: number
  duration: number
  coachNames: string[]
  capacity: number | null
  enrolled: number
  /** Null when the group has no capacity set — not "zero left". */
  spotsLeft: number | null
  full: boolean
  occurrences: GroupOccurrence[]
  /** Relationship of the asking athlete to this group. */
  membership: 'member' | 'pending' | 'none'
}

/**
 * Walk a weekly rule forward, DST-safely.
 *
 * Each step re-derives the local day start rather than adding 7*86400s to the
 * previous instant, so a group meeting at 11am keeps meeting at 11am across a
 * clock change instead of drifting to 10 or 12.
 */
function projectOccurrences(
  dayOfWeek: number,
  startMinute: number,
  duration: number,
  zone: string,
  weeks: number
): { startsAt: Date; ymd: string }[] {
  const out: { startsAt: Date; ymd: string }[] = []
  const today = startOfDayInZone(new Date(), zone)
  const todayDow = partsInZone(today, zone).weekday
  const daysAhead = (dayOfWeek - todayDow + 7) % 7

  for (let week = 0; week < weeks; week++) {
    const reference = new Date(today.getTime() + (daysAhead + week * 7) * 86400_000)
    const dayStart = startOfDayInZone(reference, zone)
    const startsAt = new Date(dayStart.getTime() + startMinute * 60_000)
    // Today's class may already be over; don't advertise a spot in it.
    if (startsAt.getTime() < Date.now()) continue
    const p = partsInZone(dayStart, zone)
    out.push({
      startsAt,
      ymd: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    })
  }
  void duration
  return out
}

/**
 * Every group a family is allowed to see, with its next few meetings.
 *
 * `athleteIds` is the whole family, so a parent with three kids sees one list
 * and each row knows which of their kids is already in.
 */
export async function listOpenGroups(
  gymId: string,
  athleteIds: string[]
): Promise<OpenGroupView[]> {
  const groups = await db.group.findMany({
    where: {
      gymId,
      active: true,
      openForSignup: true,
      // A group with no standing time has nothing to show on a schedule.
      dayOfWeek: { not: null },
      startMinute: { not: null },
    },
    include: {
      members: { include: { athlete: { select: { id: true, archived: true } } } },
      coaches: { include: { trainer: { select: { user: { select: { name: true } } } } } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  })
  if (groups.length === 0) return []

  const zone = await getGymTimezone(gymId)

  // Which of these groups already have Sessions on the books, so the UI can
  // tell a confirmed class from a projected one.
  const sessions = await db.session.findMany({
    where: {
      gymId,
      cancelled: false,
      groupId: { in: groups.map((g) => g.id) },
      scheduledAt: { gte: new Date() },
    },
    select: { id: true, groupId: true, scheduledAt: true },
  })
  const sessionByKey = new Map<string, string>()
  for (const s of sessions) {
    sessionByKey.set(`${s.groupId}:${s.scheduledAt.toISOString()}`, s.id)
  }

  const pending = await db.groupJoinRequest.findMany({
    where: { gymId, status: 'pending', athleteId: { in: athleteIds } },
    select: { groupId: true },
  })
  const pendingGroupIds = new Set(pending.map((p) => p.groupId))

  return groups.map((g) => {
    const active = g.members.filter((m) => !m.athlete.archived)
    const enrolled = active.length
    const spotsLeft = g.capacity === null ? null : Math.max(0, g.capacity - enrolled)
    const isMember = active.some((m) => athleteIds.includes(m.athleteId))

    const occurrences = projectOccurrences(
      g.dayOfWeek!,
      g.startMinute!,
      g.duration,
      zone,
      BROWSE_WEEKS
    ).map(({ startsAt }) => ({
      key: `${g.id}:${startsAt.toISOString()}`,
      startsAt: startsAt.toISOString(),
      duration: g.duration,
      sessionId: sessionByKey.get(`${g.id}:${startsAt.toISOString()}`) ?? null,
    }))

    return {
      id: g.id,
      name: g.name,
      description: g.description,
      dayOfWeek: g.dayOfWeek!,
      startMinute: g.startMinute!,
      duration: g.duration,
      coachNames: g.coaches.map((c) => c.trainer.user.name),
      capacity: g.capacity,
      enrolled,
      spotsLeft,
      full: spotsLeft !== null && spotsLeft === 0,
      occurrences,
      membership: isMember ? 'member' : pendingGroupIds.has(g.id) ? 'pending' : 'none',
    }
  })
}

export interface AddToGroupResult {
  added: boolean
  reason?: string
  /** Future sessions this athlete was slotted into. */
  joinedSessions: number
  /** Weeks newly put on the calendar because the group had none yet. */
  createdSessions: number
}

/**
 * Put an athlete on a group's roster, and make the calendar agree.
 *
 * Three things have to happen together, and missing any one of them is a bug a
 * parent would notice:
 *   1. the roster row, so future materializations include them;
 *   2. every future session the group ALREADY has, or a kid who joins in week
 *      three silently has no sessions until week nine;
 *   3. materializing the group if it had no sessions at all — the common case
 *      for the first athlete into an open group.
 */
export async function addAthleteToGroup(
  groupId: string,
  athleteId: string
): Promise<AddToGroupResult> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { athlete: { select: { id: true, archived: true } } } } },
  })
  if (!group) return { added: false, reason: 'Group not found.', joinedSessions: 0, createdSessions: 0 }
  if (!group.active) {
    return { added: false, reason: 'That group is retired.', joinedSessions: 0, createdSessions: 0 }
  }

  const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete || athlete.gymId !== group.gymId) {
    return { added: false, reason: 'Athlete not found.', joinedSessions: 0, createdSessions: 0 }
  }
  if (athlete.archived) {
    return { added: false, reason: 'That athlete is archived.', joinedSessions: 0, createdSessions: 0 }
  }

  const active = group.members.filter((m) => !m.athlete.archived)
  if (active.some((m) => m.athleteId === athleteId)) {
    return { added: true, joinedSessions: 0, createdSessions: 0 }
  }
  // Capacity is checked HERE rather than at request time: two families can
  // both ask for the last spot, and the one that gets approved second should
  // be the one that's refused.
  if (group.capacity !== null && active.length >= group.capacity) {
    return {
      added: false,
      reason: `${group.name} is full (${group.capacity} spots).`,
      joinedSessions: 0,
      createdSessions: 0,
    }
  }

  await db.groupMember.upsert({
    where: { groupId_athleteId: { groupId, athleteId } },
    create: { groupId, athleteId },
    update: {},
  })

  // Slot them into the sessions that already exist.
  const future = await db.session.findMany({
    where: { groupId, cancelled: false, scheduledAt: { gte: new Date() } },
    select: { id: true },
  })
  for (const s of future) {
    await db.sessionAttendee.upsert({
      where: { sessionId_athleteId: { sessionId: s.id, athleteId } },
      create: { sessionId: s.id, athleteId },
      update: {},
    })
  }

  // If the group had nothing on the calendar, this athlete is the reason it
  // now can. materializeGroup is idempotent, so this is safe either way.
  let createdSessions = 0
  if (future.length === 0 && group.dayOfWeek !== null && group.startMinute !== null) {
    const result = await materializeGroup(groupId, MATERIALIZE_WEEKS)
    createdSessions = result.created.length
  }

  return { added: true, joinedSessions: future.length, createdSessions }
}

/** Take an athlete off a roster and out of the group's future sessions. */
export async function removeAthleteFromGroup(groupId: string, athleteId: string) {
  await db.groupMember.deleteMany({ where: { groupId, athleteId } })
  const future = await db.session.findMany({
    where: { groupId, cancelled: false, scheduledAt: { gte: new Date() } },
    select: { id: true, athleteId: true },
  })
  for (const s of future) {
    // Never orphan a session by removing its primary attendee here; the
    // group-primary reassignment in athletes.ts owns that case.
    if (s.athleteId === athleteId) continue
    await db.sessionAttendee.deleteMany({ where: { sessionId: s.id, athleteId } })
  }
  return { removedFrom: future.length }
}
