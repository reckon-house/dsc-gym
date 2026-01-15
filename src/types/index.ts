// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Session user (from JWT)
export interface SessionUser {
  userId: string
  email: string
  name: string
  role: 'ADMIN' | 'TRAINER'
  trainerId?: string
}

// Parsed NLP action types
export type ParsedAction =
  | 'CREATE_SESSION'
  | 'CREATE_RECURRING_SESSION'
  | 'UPDATE_SESSION'
  | 'CANCEL_SESSION'
  | 'CREATE_ATHLETE'
  | 'QUERY'
  | 'UNKNOWN'

export interface ParsedSession {
  athleteId?: string
  athleteName: string
  isNewAthlete: boolean
  scheduledAt: string
  duration: number
  recurrencePattern?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  recurrenceEndDate?: string
}

export interface ParsedAthlete {
  firstName: string
  lastName: string
  email?: string
}

export interface ParseResult {
  action: ParsedAction
  confidence: number
  data: {
    session?: ParsedSession
    athlete?: ParsedAthlete
  }
  clarificationNeeded?: string
  humanReadableSummary: string
}

// Database models (for API responses)
export interface TrainerWithUser {
  id: string
  userId: string
  user: {
    id: string
    email: string
    name: string
    role: string
  }
}

export interface AthleteWithTrainer {
  id: string
  firstName: string
  lastName: string
  email: string
  trainerId: string
  createdAt: Date
}

export interface SessionWithDetails {
  id: string
  trainerId: string
  athleteId: string
  scheduledAt: Date
  duration: number
  isRecurring: boolean
  recurrencePattern?: string
  completed: boolean
  completedAt?: Date
  cancelled: boolean
  notes?: string
  athlete: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}
