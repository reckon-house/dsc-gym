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
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
})

const ParseResultSchema = z.object({
  action: z.enum([
    'CREATE_SESSION',
    'CREATE_RECURRING_SESSION',
    'UPDATE_SESSION',
    'CANCEL_SESSION',
    'CREATE_ATHLETE',
    'QUERY',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  data: z.object({
    session: ParsedSessionSchema.optional(),
    athlete: ParsedAthleteSchema.optional(),
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
    const validated = ParseResultSchema.parse(parsed)

    return {
      action: validated.action as ParsedAction,
      confidence: validated.confidence,
      data: {
        session: validated.data.session
          ? {
              athleteId: validated.data.session.athleteId ?? undefined,
              athleteName: validated.data.session.athleteName,
              isNewAthlete: validated.data.session.isNewAthlete,
              scheduledAt: validated.data.session.scheduledAt,
              duration: validated.data.session.duration,
              recurrencePattern: validated.data.session.recurrencePattern ?? undefined,
              recurrenceEndDate: validated.data.session.recurrenceEndDate ?? undefined,
            }
          : undefined,
        athlete: validated.data.athlete,
      },
      clarificationNeeded: validated.clarificationNeeded ?? undefined,
      humanReadableSummary: validated.humanReadableSummary,
    }
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
