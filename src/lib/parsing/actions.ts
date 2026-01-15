import { db } from '@/lib/db'
import type { ParseResult, ParsedSession } from '@/types'

export interface ExecutionResult {
  success: boolean
  message: string
  data?: {
    session?: { id: string }
    sessions?: { id: string }[]
    athlete?: { id: string; firstName: string; lastName: string }
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

    case 'UNKNOWN':
    case 'QUERY':
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
