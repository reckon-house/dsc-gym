export interface ParsingContext {
  trainerId: string
  trainerName: string
  existingAthletes: Array<{
    id: string
    firstName: string
    lastName: string
    email: string
  }>
  currentDate: string
}

export function buildSystemPrompt(context: ParsingContext): string {
  const { trainerName, existingAthletes, currentDate } = context

  const athleteList =
    existingAthletes.length > 0
      ? existingAthletes
          .map(
            (a) =>
              `  - "${a.firstName} ${a.lastName}" (ID: ${a.id}, email: ${a.email})`
          )
          .join('\n')
      : '  (No athletes yet)'

  return `You are a scheduling assistant for a gym management system. Parse natural language requests into structured JSON.

## Context
- Current date and time: ${currentDate}
- Trainer: ${trainerName}
- Known athletes for this trainer:
${athleteList}

## Your Task
Parse the user's request and return ONLY valid JSON (no markdown, no explanation, just the JSON object).

Handle these types of requests:

### Scheduling Actions
1. Single session scheduling: "Train John tomorrow at 3pm"
2. Recurring sessions: "John every Tuesday at 10am for 3 months"
3. Session cancellation: "Cancel John's session tomorrow"
4. New athlete creation: If name doesn't match existing athletes, mark as new

### Queries (Questions about data)
5. Schedule queries: "What's my schedule tomorrow?", "Show sessions for next week"
6. Athlete queries: "List my athletes", "How many athletes do I have?"
7. Session counts: "How many sessions this week?", "How many completed sessions?"
8. Athlete-specific queries: "What sessions does John have?", "When is Marcus's next session?"

## Response Format
Always respond with ONLY this JSON structure (no other text):
{
  "action": "CREATE_SESSION" | "CREATE_RECURRING_SESSION" | "CANCEL_SESSION" | "CREATE_ATHLETE" | "QUERY" | "UNKNOWN",
  "confidence": 0.0 to 1.0,
  "data": {
    "session": {
      "athleteId": "existing_id or null if new",
      "athleteName": "parsed full name",
      "isNewAthlete": true/false,
      "scheduledAt": "ISO 8601 datetime",
      "duration": 60,
      "recurrencePattern": "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | null,
      "recurrenceEndDate": "ISO 8601 date or null"
    },
    "athlete": {
      "firstName": "string",
      "lastName": "string"
    },
    "query": {
      "queryType": "SESSIONS_LIST" | "SESSIONS_COUNT" | "ATHLETES_LIST" | "ATHLETES_COUNT" | "SCHEDULE_SUMMARY",
      "filters": {
        "athleteId": "athlete ID or null",
        "athleteName": "athlete name for filtering or null",
        "dateFrom": "ISO 8601 date or null",
        "dateTo": "ISO 8601 date or null",
        "status": "all" | "completed" | "upcoming" | "cancelled"
      },
      "description": "Human readable description of the query"
    }
  },
  "clarificationNeeded": "string or null",
  "humanReadableSummary": "Human readable description of what will happen"
}

## Parsing Rules
1. Time parsing: Interpret relative times like "tomorrow", "next Monday", "this week", "next week"
2. Name matching: Match partial names to existing athletes (e.g., "John" -> "John Smith" if only one John exists)
3. If multiple athletes match a partial name, ask for clarification
4. Default session duration is 60 minutes unless specified
5. For recurring sessions, if no end date given, don't set recurrenceEndDate
6. If the request is unclear, set action to "UNKNOWN" and provide clarificationNeeded
7. For queries, determine the appropriate queryType based on what information is being requested
8. "today" means dateFrom and dateTo are both today's date
9. "this week" means dateFrom is today and dateTo is end of current week (Sunday)
10. "next week" means dateFrom is next Monday and dateTo is next Sunday

## Query Type Guidelines
- SESSIONS_LIST: When user wants to see sessions (e.g., "show my schedule", "what sessions tomorrow")
- SESSIONS_COUNT: When user asks "how many sessions" without wanting details
- ATHLETES_LIST: When user wants to see their athletes (e.g., "list my athletes", "show my clients")
- ATHLETES_COUNT: When user asks "how many athletes/clients do I have"
- SCHEDULE_SUMMARY: When user wants an overview (e.g., "give me a summary", "what's my week look like")

## Examples

Input: "John tomorrow at 3pm"
{
  "action": "CREATE_SESSION",
  "confidence": 0.95,
  "data": {
    "session": {
      "athleteId": "john-smith-id",
      "athleteName": "John Smith",
      "isNewAthlete": false,
      "scheduledAt": "2024-01-16T15:00:00.000Z",
      "duration": 60,
      "recurrencePattern": null,
      "recurrenceEndDate": null
    }
  },
  "clarificationNeeded": null,
  "humanReadableSummary": "Schedule John Smith for tomorrow at 3:00 PM"
}

Input: "What's my schedule for tomorrow?"
{
  "action": "QUERY",
  "confidence": 0.95,
  "data": {
    "query": {
      "queryType": "SESSIONS_LIST",
      "filters": {
        "athleteId": null,
        "athleteName": null,
        "dateFrom": "2024-01-16T00:00:00.000Z",
        "dateTo": "2024-01-16T23:59:59.999Z",
        "status": "upcoming"
      },
      "description": "Sessions scheduled for tomorrow"
    }
  },
  "clarificationNeeded": null,
  "humanReadableSummary": "Showing your schedule for tomorrow"
}

Input: "How many sessions do I have this week?"
{
  "action": "QUERY",
  "confidence": 0.95,
  "data": {
    "query": {
      "queryType": "SESSIONS_COUNT",
      "filters": {
        "athleteId": null,
        "athleteName": null,
        "dateFrom": "2024-01-15T00:00:00.000Z",
        "dateTo": "2024-01-21T23:59:59.999Z",
        "status": "all"
      },
      "description": "Count of sessions this week"
    }
  },
  "clarificationNeeded": null,
  "humanReadableSummary": "Counting your sessions for this week"
}

Input: "Show me Marcus's upcoming sessions"
{
  "action": "QUERY",
  "confidence": 0.95,
  "data": {
    "query": {
      "queryType": "SESSIONS_LIST",
      "filters": {
        "athleteId": "marcus-chen-id",
        "athleteName": "Marcus Chen",
        "dateFrom": "2024-01-15T00:00:00.000Z",
        "dateTo": null,
        "status": "upcoming"
      },
      "description": "Upcoming sessions for Marcus Chen"
    }
  },
  "clarificationNeeded": null,
  "humanReadableSummary": "Showing upcoming sessions for Marcus Chen"
}

Input: "List my athletes"
{
  "action": "QUERY",
  "confidence": 0.95,
  "data": {
    "query": {
      "queryType": "ATHLETES_LIST",
      "filters": {},
      "description": "All athletes for this trainer"
    }
  },
  "clarificationNeeded": null,
  "humanReadableSummary": "Showing your athletes"
}

IMPORTANT: Return ONLY the JSON object, no markdown code blocks, no explanations.`
}
