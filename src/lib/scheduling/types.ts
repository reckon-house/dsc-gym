// Shared types for the scheduling engine.
// Everything is plain data — no Prisma types leak through the engine's
// public surface.

export type Minute = number // 0..1439, minutes from midnight in gym's timezone
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sunday..Saturday

export interface TimeWindow {
  start: Date
  end: Date
}

export interface AvailabilityWindow {
  dayOfWeek: DayOfWeek
  startMinute: Minute
  endMinute: Minute
}

export interface ResolvedAvailability {
  trainerId: string
  date: string // YYYY-MM-DD
  windows: { startMinute: Minute; endMinute: Minute }[]
}

export interface BookingInput {
  trainerId: string
  /**
   * Null when validating an open class that nobody has joined yet. The
   * athlete-specific checks (archived, already-booked, same-trainer-same-day)
   * are skipped in that case; the coach and floor checks still run.
   */
  athleteId: string | null
  scheduledAt: Date
  duration: number
}

// Group bookings allow multiple athletes in one session with one trainer.
// One-on-one bookings are just groups of size 1.
export interface GroupBookingInput {
  /** Lead coach. Stored as Session.trainerId for backwards compatibility. */
  trainerId: string
  athleteIds: string[] // length 1 for solo, >1 for group
  scheduledAt: Date
  duration: number
  /** All coaches incl. the lead. Defaults to [trainerId] when omitted. */
  coachIds?: string[]
  /** Set when this booking came from a Group's recurring schedule. */
  groupId?: string | null
  notes?: string | null
}

export type ConflictKind =
  | 'OUTSIDE_AVAILABILITY'
  | 'TRAINER_DOUBLE_BOOKED'
  | 'FLOOR_CAP_EXCEEDED'
  | 'MEETING_CONFLICT'
  | 'BUFFER_VIOLATION'
  | 'SAME_TRAINER_SAME_DAY'
  | 'DISALLOWED_DURATION'
  | 'PAST_TIME'
  | 'UNKNOWN_TRAINER'
  | 'UNKNOWN_ATHLETE'

export interface Conflict {
  kind: ConflictKind
  // Full message for admin/staff use. May reference other athletes by name.
  message: string
  // Sanitized variant safe to show to athletes via the MCP server.
  // Defaults to message when no PII is present.
  publicMessage?: string
  details?: Record<string, unknown>
}

export interface ValidationResult {
  ok: boolean
  conflicts: Conflict[]
}

export interface ProposedChange {
  id?: string
  action: 'create' | 'move' | 'cancel'
  trainerId?: string
  athleteId?: string
  scheduledAt?: Date
  duration?: number
  existingSessionId?: string
  notes?: string
  conflictReason?: string | null
  /** Deliberate backfill of something that already happened. */
  allowPast?: boolean
}

export interface SlotSuggestion {
  trainerId: string
  start: Date
  end: Date
}

export interface ScheduledSession {
  id: string
  gymId: string
  trainerId: string
  /** Null for an open class with nobody in it yet. Roster is SessionAttendee. */
  athleteId: string | null
  scheduledAt: Date
  duration: number
  cancelled: boolean
  completed: boolean
}
