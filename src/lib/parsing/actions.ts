import { db } from '@/lib/db'
import type { ParseResult, ParsedSession, ParsedQuery } from '@/types'

export interface QueryResultData {
  sessions?: Array<{
    id: string
    athleteName: string
    scheduledAt: string
    duration: number
    completed: boolean
    cancelled: boolean
  }>
  athletes?: Array<{
    id: string
    firstName: string
    lastName: string
    email: string
  }>
  count?: number
  summary?: {
    totalSessions: number
    completedSessions: number
    upcomingSessions: number
    totalAthletes: number
  }
}

export interface ExecutionResult {
  success: boolean
  message: string
  data?: {
    session?: { id: string }
    sessions?: { id: string }[]
    athlete?: { id: string; firstName: string; lastName: string }
    queryResult?: QueryResultData
  }
  error?: string
}

export async function executeAction(
  parseResult: ParseResult,
  trainerId: string
): Promise<ExecutionResult> {
  const { action, data } = parseResult

  switch (action) {
    case 'CREATE_SESSION':
      return createSession(data.session!, trainerId)

    case 'CREATE_RECURRING_SESSION':
      return createRecurringSessions(data.session!, trainerId)

    case 'CANCEL_SESSION':
      return cancelSession(data.session!, trainerId)

    case 'CREATE_ATHLETE':
      if (!data.athlete) {
        return { success: false, message: 'No athlete data provided', error: 'Missing athlete data' }
      }
      return createAthlete(data.athlete, trainerId)

    case 'QUERY':
      if (!data.query) {
        return { success: false, message: 'No query data provided', error: 'Missing query data' }
      }
      return executeQuery(data.query, trainerId)

    case 'UNKNOWN':
    default:
      return {
        success: false,
        message: parseResult.clarificationNeeded || 'Unknown action',
        error: 'Action not supported',
      }
  }
}

async function createSession(
  sessionData: ParsedSession,
  trainerId: string
): Promise<ExecutionResult> {
  try {
    let athleteId = sessionData.athleteId

    // If new athlete, create them first
    if (sessionData.isNewAthlete && !athleteId) {
      const nameParts = sessionData.athleteName.split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || 'Unknown'

      const athlete = await db.athlete.create({
        data: {
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@placeholder.com`,
          trainerId,
        },
      })
      athleteId = athlete.id
    }

    if (!athleteId) {
      return {
        success: false,
        message: 'Could not identify or create athlete',
        error: 'Missing athlete ID',
      }
    }

    const session = await db.session.create({
      data: {
        trainerId,
        athleteId,
        scheduledAt: new Date(sessionData.scheduledAt),
        duration: sessionData.duration,
        isRecurring: false,
      },
    })

    return {
      success: true,
      message: `Session scheduled for ${sessionData.athleteName}`,
      data: { session: { id: session.id } },
    }
  } catch (error) {
    console.error('Error creating session:', error)
    return {
      success: false,
      message: 'Failed to create session',
      error: String(error),
    }
  }
}

async function createRecurringSessions(
  sessionData: ParsedSession,
  trainerId: string
): Promise<ExecutionResult> {
  try {
    let athleteId = sessionData.athleteId

    // If new athlete, create them first
    if (sessionData.isNewAthlete && !athleteId) {
      const nameParts = sessionData.athleteName.split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || 'Unknown'

      const athlete = await db.athlete.create({
        data: {
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@placeholder.com`,
          trainerId,
        },
      })
      athleteId = athlete.id
    }

    if (!athleteId) {
      return {
        success: false,
        message: 'Could not identify or create athlete',
        error: 'Missing athlete ID',
      }
    }

    // Create parent session
    const parentSession = await db.session.create({
      data: {
        trainerId,
        athleteId,
        scheduledAt: new Date(sessionData.scheduledAt),
        duration: sessionData.duration,
        isRecurring: true,
        recurrencePattern: sessionData.recurrencePattern,
        recurrenceEndDate: sessionData.recurrenceEndDate
          ? new Date(sessionData.recurrenceEndDate)
          : null,
      },
    })

    // Generate recurring sessions for the next 3 months (or until end date)
    const endDate = sessionData.recurrenceEndDate
      ? new Date(sessionData.recurrenceEndDate)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days default

    const sessions = await generateRecurringSessions(
      parentSession.id,
      trainerId,
      athleteId,
      new Date(sessionData.scheduledAt),
      endDate,
      sessionData.recurrencePattern!,
      sessionData.duration
    )

    return {
      success: true,
      message: `Created ${sessions.length + 1} recurring sessions for ${sessionData.athleteName}`,
      data: {
        session: { id: parentSession.id },
        sessions: sessions.map((s) => ({ id: s.id })),
      },
    }
  } catch (error) {
    console.error('Error creating recurring sessions:', error)
    return {
      success: false,
      message: 'Failed to create recurring sessions',
      error: String(error),
    }
  }
}

async function generateRecurringSessions(
  parentId: string,
  trainerId: string,
  athleteId: string,
  startDate: Date,
  endDate: Date,
  pattern: string,
  duration: number
) {
  const sessions = []
  const currentDate = new Date(startDate)

  // Move to next occurrence
  advanceDate(currentDate, pattern)

  while (currentDate <= endDate) {
    const session = await db.session.create({
      data: {
        trainerId,
        athleteId,
        scheduledAt: new Date(currentDate),
        duration,
        isRecurring: true,
        recurrencePattern: pattern,
        parentSessionId: parentId,
      },
    })
    sessions.push(session)
    advanceDate(currentDate, pattern)
  }

  return sessions
}

function advanceDate(date: Date, pattern: string) {
  switch (pattern) {
    case 'DAILY':
      date.setDate(date.getDate() + 1)
      break
    case 'WEEKLY':
      date.setDate(date.getDate() + 7)
      break
    case 'BIWEEKLY':
      date.setDate(date.getDate() + 14)
      break
    case 'MONTHLY':
      date.setMonth(date.getMonth() + 1)
      break
  }
}

async function cancelSession(
  sessionData: ParsedSession,
  trainerId: string
): Promise<ExecutionResult> {
  try {
    // Find the session to cancel
    const session = await db.session.findFirst({
      where: {
        trainerId,
        athlete: sessionData.athleteId
          ? { id: sessionData.athleteId }
          : {
              OR: [
                { firstName: { contains: sessionData.athleteName.split(' ')[0] } },
              ],
            },
        scheduledAt: {
          gte: new Date(new Date(sessionData.scheduledAt).setHours(0, 0, 0, 0)),
          lt: new Date(new Date(sessionData.scheduledAt).setHours(23, 59, 59, 999)),
        },
        cancelled: false,
      },
    })

    if (!session) {
      return {
        success: false,
        message: 'Could not find a matching session to cancel',
        error: 'Session not found',
      }
    }

    await db.session.update({
      where: { id: session.id },
      data: { cancelled: true },
    })

    return {
      success: true,
      message: `Session cancelled for ${sessionData.athleteName}`,
      data: { session: { id: session.id } },
    }
  } catch (error) {
    console.error('Error cancelling session:', error)
    return {
      success: false,
      message: 'Failed to cancel session',
      error: String(error),
    }
  }
}

async function createAthlete(
  athleteData: { firstName: string; lastName: string; email?: string },
  trainerId: string
): Promise<ExecutionResult> {
  try {
    const athlete = await db.athlete.create({
      data: {
        firstName: athleteData.firstName,
        lastName: athleteData.lastName,
        email:
          athleteData.email ||
          `${athleteData.firstName.toLowerCase()}.${athleteData.lastName.toLowerCase()}.${Date.now()}@placeholder.com`,
        trainerId,
      },
    })

    return {
      success: true,
      message: `Created new athlete: ${athlete.firstName} ${athlete.lastName}`,
      data: {
        athlete: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
        },
      },
    }
  } catch (error) {
    console.error('Error creating athlete:', error)
    return {
      success: false,
      message: 'Failed to create athlete',
      error: String(error),
    }
  }
}

async function executeQuery(
  query: ParsedQuery,
  trainerId: string
): Promise<ExecutionResult> {
  try {
    const { queryType, filters } = query

    switch (queryType) {
      case 'SESSIONS_LIST': {
        const whereClause: Record<string, unknown> = { trainerId }

        // Apply date filters
        if (filters.dateFrom || filters.dateTo) {
          whereClause.scheduledAt = {}
          if (filters.dateFrom) {
            (whereClause.scheduledAt as Record<string, Date>).gte = new Date(filters.dateFrom)
          }
          if (filters.dateTo) {
            (whereClause.scheduledAt as Record<string, Date>).lte = new Date(filters.dateTo)
          }
        }

        // Apply athlete filter
        if (filters.athleteId) {
          whereClause.athleteId = filters.athleteId
        }

        // Apply status filter
        if (filters.status === 'completed') {
          whereClause.completed = true
          whereClause.cancelled = false
        } else if (filters.status === 'upcoming') {
          whereClause.completed = false
          whereClause.cancelled = false
        } else if (filters.status === 'cancelled') {
          whereClause.cancelled = true
        }
        // 'all' = no filter

        const sessions = await db.session.findMany({
          where: whereClause,
          include: { athlete: true },
          orderBy: { scheduledAt: 'asc' },
          take: 50,
        })

        return {
          success: true,
          message: query.description,
          data: {
            queryResult: {
              sessions: sessions.map(s => ({
                id: s.id,
                athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
                scheduledAt: s.scheduledAt.toISOString(),
                duration: s.duration,
                completed: s.completed,
                cancelled: s.cancelled,
              })),
            },
          },
        }
      }

      case 'SESSIONS_COUNT': {
        const whereClause: Record<string, unknown> = { trainerId }

        if (filters.dateFrom || filters.dateTo) {
          whereClause.scheduledAt = {}
          if (filters.dateFrom) {
            (whereClause.scheduledAt as Record<string, Date>).gte = new Date(filters.dateFrom)
          }
          if (filters.dateTo) {
            (whereClause.scheduledAt as Record<string, Date>).lte = new Date(filters.dateTo)
          }
        }

        if (filters.athleteId) {
          whereClause.athleteId = filters.athleteId
        }

        if (filters.status === 'completed') {
          whereClause.completed = true
          whereClause.cancelled = false
        } else if (filters.status === 'upcoming') {
          whereClause.completed = false
          whereClause.cancelled = false
        } else if (filters.status === 'cancelled') {
          whereClause.cancelled = true
        }

        const count = await db.session.count({ where: whereClause })

        return {
          success: true,
          message: query.description,
          data: {
            queryResult: { count },
          },
        }
      }

      case 'ATHLETES_LIST': {
        const athletes = await db.athlete.findMany({
          where: { trainerId },
          orderBy: { firstName: 'asc' },
        })

        return {
          success: true,
          message: query.description,
          data: {
            queryResult: {
              athletes: athletes.map(a => ({
                id: a.id,
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
              })),
            },
          },
        }
      }

      case 'ATHLETES_COUNT': {
        const count = await db.athlete.count({ where: { trainerId } })

        return {
          success: true,
          message: query.description,
          data: {
            queryResult: { count },
          },
        }
      }

      case 'SCHEDULE_SUMMARY': {
        const now = new Date()
        const [totalSessions, completedSessions, upcomingSessions, totalAthletes] = await Promise.all([
          db.session.count({ where: { trainerId } }),
          db.session.count({ where: { trainerId, completed: true } }),
          db.session.count({
            where: {
              trainerId,
              completed: false,
              cancelled: false,
              scheduledAt: { gte: now },
            }
          }),
          db.athlete.count({ where: { trainerId } }),
        ])

        return {
          success: true,
          message: query.description,
          data: {
            queryResult: {
              summary: {
                totalSessions,
                completedSessions,
                upcomingSessions,
                totalAthletes,
              },
            },
          },
        }
      }

      default:
        return {
          success: false,
          message: 'Unknown query type',
          error: `Query type ${queryType} not supported`,
        }
    }
  } catch (error) {
    console.error('Error executing query:', error)
    return {
      success: false,
      message: 'Failed to execute query',
      error: String(error),
    }
  }
}
