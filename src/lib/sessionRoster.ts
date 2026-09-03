// Who is actually in a session.
//
// Session.athleteId used to be required, so most code read `session.athlete`
// and treated it as "the" athlete. That was always a half-truth for group
// sessions and it is now simply wrong: a class can sit on the calendar with
// nobody in it, which is the normal state of an open class before anyone
// signs up.
//
// SessionAttendee is the roster. This helper is the one place that knows how
// to read it, including the legacy fallback for any old row that predates
// attendee tracking, so no caller has to remember the rule.

/** Minimal shape a session needs for its roster to be read. */
export interface HasRoster<A> {
  athlete?: A | null
  attendees?: { athlete: A }[] | null
}

/**
 * Everyone in the session, in roster order.
 *
 * Returns an empty array for an open class with no signups yet — callers must
 * handle that rather than assuming a first element.
 */
export function sessionRoster<A>(session: HasRoster<A>): A[] {
  if (session.attendees && session.attendees.length > 0) {
    return session.attendees.map((a) => a.athlete)
  }
  // Pre-dates SessionAttendee, or a single booking that never got a row.
  return session.athlete ? [session.athlete] : []
}

/**
 * A short label for a calendar cell or an email line.
 *
 * `groupName` wins when present, because "Youth Athlete Training (4)" tells a
 * coach more at 6am than the first kid's name does.
 */
export function rosterLabel(
  people: { firstName: string; lastName: string }[],
  groupName?: string | null,
  emptyLabel = 'Open — no one yet'
): string {
  if (groupName) {
    return people.length ? `${groupName} (${people.length})` : `${groupName} — open`
  }
  if (people.length === 0) return emptyLabel
  if (people.length === 1) return `${people[0].firstName} ${people[0].lastName}`
  return `${people[0].firstName} +${people.length - 1}`
}

/**
 * What a coach is busy with, for a conflict message.
 *
 * Conflict text used to name the athlete directly, which now breaks on an open
 * class that has nobody in it. Naming the class is also just better: "Scott is
 * already running Youth Athlete Training (4)" tells the owner more than one
 * kid's name from a group of four.
 */
export function describeOccupant(session: {
  athlete?: { firstName: string; lastName: string } | null
  attendees?: { athlete: { firstName: string; lastName: string } }[] | null
  group?: { name: string } | null
}): string {
  const people = sessionRoster(session)
  if (session.group?.name) {
    return people.length ? `${session.group.name} (${people.length})` : session.group.name
  }
  if (people.length === 0) return 'an open class'
  if (people.length === 1) return `${people[0].firstName} ${people[0].lastName}`
  return `${people[0].firstName} and ${people.length - 1} other${people.length > 2 ? 's' : ''}`
}
