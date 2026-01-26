import { z } from 'zod'
import type { ParseResult, ParsedAction } from '@/types'

// Zod schema for validating Claude's response
const ParsedSessionSchema = z.object({
  athleteId: z.string().nullable().optional(),
  athleteName: z.string(),
  isNewAthlete: z.boolean(),
  scheduledAt: z.string(),
  duration: z.number().default(60),
  recurrencePattern: z
    .enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
    .nullable()
    .optional(),
  recurrenceEndDate: z.string().nullable().optional(),
})

const ParsedAthleteSchema = z.object({
  id: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
})

const ParsedQuerySchema = z.object({
  queryType: z.enum([
    'SESSIONS_LIST',
    'SESSIONS_COUNT',
    'ATHLETES_LIST',
    'ATHLETES_COUNT',
    'SCHEDULE_SUMMARY',
    'CHECKINS_LIST',
    'ATTENDANCE_REPORT',
  ]),
  filters: z.object({
    athleteId: z.string().nullable().optional(),
    athleteName: z.string().nullable().optional(),
    dateFrom: z.string().nullable().optional(),
    dateTo: z.string().nullable().optional(),
    status: z.enum(['all', 'completed', 'upcoming', 'cancelled']).optional(),
  }).optional().default({}),
  description: z.string(),
})

const ParseResultSchema = z.object({
  action: z.enum([
    'CREATE_SESSION',
    'CREATE_RECURRING_SESSION',
    'UPDATE_SESSION',
    'CANCEL_SESSION',
    'CREATE_ATHLETE',
    'DELETE_ATHLETE',
    'QUERY',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  data: z.object({
    session: ParsedSessionSchema.optional(),
    athlete: ParsedAthleteSchema.optional(),
    query: ParsedQuerySchema.optional(),
  }),
  clarificationNeeded: z.string().nullable().optional(),
  humanReadableSummary: z.string(),
})

export function parseClaudeResponse(responseText: string): ParseResult {
  try {
    // Try to extract JSON from the response (in case Claude adds extra text)
    let jsonStr = responseText.trim()

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const parsed = JSON.parse(jsonStr)

    // Debug: log what Claude actually returned
    console.log('Claude raw response:', JSON.stringify(parsed, null, 2))

    const validated = ParseResultSchema.parse(parsed)

    // Debug: log validated result
    console.log('Validated data.query:', validated.data.query)

    // Build the result object explicitly
    const result: ParseResult = {
      action: validated.action as ParsedAction,
      confidence: validated.confidence,
      data: {},
      clarificationNeeded: validated.clarificationNeeded ?? undefined,
      humanReadableSummary: validated.humanReadableSummary,
    }

    // Add session data if present
    if (validated.data.session) {
      result.data.session = {
        athleteId: validated.data.session.athleteId ?? undefined,
        athleteName: validated.data.session.athleteName,
        isNewAthlete: validated.data.session.isNewAthlete,
        scheduledAt: validated.data.session.scheduledAt,
        duration: validated.data.session.duration,
        recurrencePattern: validated.data.session.recurrencePattern ?? undefined,
        recurrenceEndDate: validated.data.session.recurrenceEndDate ?? undefined,
      }
    }

    // Add athlete data if present
    if (validated.data.athlete) {
      result.data.athlete = {
        id: validated.data.athlete.id ?? undefined,
        firstName: validated.data.athlete.firstName,
        lastName: validated.data.athlete.lastName,
        email: validated.data.athlete.email,
      }
    }

    // Add query data if present
    if (validated.data.query) {
      result.data.query = {
        queryType: validated.data.query.queryType as import('@/types').QueryType,
        filters: {
          athleteId: validated.data.query.filters?.athleteId ?? undefined,
          athleteName: validated.data.query.filters?.athleteName ?? undefined,
          dateFrom: validated.data.query.filters?.dateFrom ?? undefined,
          dateTo: validated.data.query.filters?.dateTo ?? undefined,
          status: validated.data.query.filters?.status,
        },
        description: validated.data.query.description,
      }
    }

    return result
  } catch (error) {
    console.error('Failed to parse Claude response:', error)
    console.error('Raw response:', responseText)

    return {
      action: 'UNKNOWN',
      confidence: 0,
      data: {},
      clarificationNeeded: 'Failed to parse the response. Please try again.',
      humanReadableSummary: 'Error parsing request',
    }
  }
}
