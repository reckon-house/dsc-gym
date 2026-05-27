// MCP server for athletes. Speaks JSON-RPC 2.0 over HTTP POST.
//
// Auth: requires a valid OAuth 2.1 bearer token (issued from /oauth/token)
// in the Authorization header. The token's athleteId scopes every call
// — an athlete can ONLY see / modify their own data.
//
// Tools exposed:
//   my_sessions            — upcoming + recent sessions
//   my_trainer             — assigned trainer info
//   my_trainer_availability — trainer's available windows over a date range
//   request_session        — create a BookingRequest for owner approval
//   cancel_session         — cancel one of the athlete's own sessions
//   my_pending_requests    — list outstanding booking requests
//
// All booking-related actions go through validateBooking — same engine
// the admin chat uses. The MCP server never bypasses the engine.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getGymTimezone,
  suggestSlots,
  validateBooking,
} from '@/lib/scheduling/engine'
import { resolveAvailabilityForRange } from '@/lib/scheduling/availability'
import {
  dateOnlyInZone,
  formatHuman,
  formatTime,
  minutesToHHMM,
  startOfDayInZone,
} from '@/lib/scheduling/timezone'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { publicBaseUrl } from '@/lib/oauth/util'

// ---------------- Auth ----------------

interface Authed {
  athleteId: string
  clientId: string
  scope: string
}

async function authenticate(request: NextRequest): Promise<Authed | null> {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()

  const record = await db.oAuthAccessToken.findUnique({ where: { token } })
  if (!record) return null
  if (record.revokedAt) return null
  if (record.expiresAt.getTime() < Date.now()) return null

  // Update lastUsedAt (fire-and-forget, no need to await).
  void db.oAuthAccessToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    athleteId: record.athleteId,
    clientId: record.clientId,
    scope: record.scope,
  }
}

function wwwAuthenticateHeader(request: NextRequest, error?: string): string {
  const base = publicBaseUrl(request.nextUrl.origin)
  const parts = [
    `Bearer realm="dsc-mcp"`,
    `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  ]
  if (error) parts.push(`error="${error}"`)
  return parts.join(', ')
}

function unauthorized(request: NextRequest, error = 'invalid_token'): NextResponse {
  return new NextResponse(
    JSON.stringify({ error, error_description: 'Bearer token required.' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuthenticateHeader(request, error),
      },
    }
  )
}

// ---------------- JSON-RPC helpers ----------------

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result }
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown
) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  }
}

// Render tool result as MCP "content" block (text only for now).
function textContent(text: string) {
  return {
    content: [{ type: 'text', text }],
  }
}

function structuredContent(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  }
}

// ---------------- Tool definitions ----------------

const TOOLS = [
  {
    name: 'gym_overview',
    description:
      "Get general information about Dallas Sport Collective — mission, hours, locations, contact info, and a high-level list of services. Use this for questions like 'what is DSC?', 'where are you located?', 'when are you open?', 'how do I contact the gym?'.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_services',
    description:
      'List all training programs and services DSC offers — strength & conditioning, football, track, basketball, physical therapy, speed work, nutrition, adaptive training, prenatal/postnatal, menopause programming, Pro Day / Combine prep, etc. Each entry has a short summary. Use this for questions like \'what does the gym offer?\', \'do you do nutrition coaching?\', \'is there physical therapy on site?\'.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_trainers',
    description:
      'List all active DSC trainers with their title and a one-line description of what they specialize in. Use this when the athlete wants to know who works at the gym, e.g. "who are the trainers?", "who could help me with X?". For a full bio of a specific trainer, follow up with trainer_bio.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trainer_bio',
    description:
      'Get a specific trainer\'s full bio, specialties, certifications, and education. Match by name (case-insensitive substring against first name, e.g. "Justin" or "Sara"). Use for questions like "tell me about Justin", "what are Sara\'s certifications?", "who would be best for speed training?" (call list_trainers first for the latter, then trainer_bio for the most relevant one).',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: "Trainer's first name (case-insensitive). E.g. 'Justin'.",
        },
      },
    },
  },
  {
    name: 'my_sessions',
    description:
      "List the athlete's sessions. Defaults to upcoming (next 30 days). " +
      'Pass `range`="past" to see their last 30 days instead.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['upcoming', 'past'],
          description: 'Which sessions to return. Defaults to upcoming.',
        },
      },
    },
  },
  {
    name: 'my_trainer',
    description: "Get info about the athlete's assigned trainer, if any.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'my_trainer_availability',
    description:
      "Get the athlete's trainer's available windows for a date range. " +
      'Useful before calling request_session. Pass startDate / endDate as YYYY-MM-DD.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'YYYY-MM-DD. Defaults to today.',
        },
        endDate: {
          type: 'string',
          description: 'YYYY-MM-DD. Defaults to 14 days from today.',
        },
      },
    },
  },
  {
    name: 'suggest_slots',
    description:
      "Find open slots with the athlete's primary trainer over a date range. " +
      'Filters out times the trainer is already booked or outside their hours. ' +
      'Use this before request_session when the athlete asks for "any time" or ' +
      '"some time next week" rather than naming a specific moment. ' +
      'All returned slots are in the gym\'s local time (America/Chicago).',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'YYYY-MM-DD. Defaults to today.',
        },
        endDate: {
          type: 'string',
          description: 'YYYY-MM-DD. Defaults to 14 days from today.',
        },
        duration: {
          type: 'number',
          description: 'Session length in minutes. Defaults to 60.',
          enum: [30, 60],
        },
        preferredStart: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'any'],
          description:
            'Filter to a time-of-day band: morning (<12pm), afternoon (12-5pm), evening (5pm+). Defaults to any.',
        },
        limit: {
          type: 'number',
          description: 'Max slots to return. Defaults to 20.',
        },
      },
    },
  },
  {
    name: 'request_session',
    description:
      'Request a new session. Creates a BookingRequest the gym owner must approve. ' +
      'Returns the request id. The session is NOT booked until the owner approves. ' +
      "Provide scheduledAt as an ISO 8601 datetime that INCLUDES a timezone offset. " +
      "The gym is in America/Chicago (Central). For e.g. 3:00 PM Central on May 30 2026, " +
      "send '2026-05-30T15:00:00-05:00' (CDT) or '2026-05-30T15:00:00-06:00' (CST). " +
      "If unsure which offset applies, use America/Chicago wall-clock time with the " +
      "current offset; the server normalizes to UTC.",
    inputSchema: {
      type: 'object',
      required: ['scheduledAt'],
      properties: {
        scheduledAt: {
          type: 'string',
          description:
            'ISO 8601 datetime for the requested session start, WITH timezone offset.',
        },
        duration: {
          type: 'number',
          description: 'Duration in minutes. Defaults to 60.',
          enum: [30, 60],
        },
        notes: {
          type: 'string',
          description: 'Optional message to the gym owner.',
        },
      },
    },
  },
  {
    name: 'cancel_session',
    description:
      "Cancel one of the athlete's own upcoming sessions. " +
      'The athlete can only cancel sessions where they are the primary attendee.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'my_pending_requests',
    description:
      "List the athlete's pending and recently-resolved booking requests.",
    inputSchema: { type: 'object', properties: {} },
  },
]

// ---------------- Tool implementations ----------------

async function loadAthlete(athleteId: string) {
  return db.athlete.findUnique({
    where: { id: athleteId },
    include: {
      trainer: { include: { user: { select: { name: true } } } },
    },
  })
}

// ---------------- Public gym info tools ----------------
// These don't take athleteId — they're scoped to the gym itself. We
// pass it through for symmetry with the rest of the dispatch.

async function tool_gym_overview() {
  const gym = await db.gym.findUnique({ where: { id: DEFAULT_GYM_ID } })
  if (!gym) return textContent('Gym info not found.')
  return structuredContent({
    name: gym.name,
    tagline: gym.tagline,
    mission: gym.mission,
    about: gym.about,
    hours: gym.hoursJson,
    locations: gym.locationsJson,
    contact: gym.contactJson,
    facilities: gym.facilitiesText,
    timezone: gym.timezone,
    note: 'Times are all in America/Chicago.',
  })
}

async function tool_list_services() {
  const gym = await db.gym.findUnique({
    where: { id: DEFAULT_GYM_ID },
    select: { servicesJson: true },
  })
  return structuredContent({
    services: gym?.servicesJson ?? [],
  })
}

async function tool_list_trainers_public() {
  const trainers = await db.trainer.findMany({
    where: { gymId: DEFAULT_GYM_ID, archived: false },
    include: { user: { select: { name: true } } },
    orderBy: [{ user: { name: 'asc' } }],
  })
  return structuredContent({
    trainers: trainers.map((t) => ({
      id: t.id,
      name: t.user.name,
      title: t.title,
      // First few specialties as a teaser; full list is in trainer_bio.
      specialtiesPreview: t.specialties.slice(0, 4),
      photoUrl: t.photoUrl,
    })),
  })
}

// Fetch an image URL and return a {mediaType, base64} pair suitable for
// an MCP image content block. We cap at ~1MB to avoid blowing up
// response sizes for stupidly large headshots. Returns null on any
// failure — the caller just skips the image and returns text alone.
async function fetchAsBase64(
  url: string
): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const mediaType = res.headers.get('content-type')?.split(';')[0]?.trim()
    if (!mediaType?.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 1_500_000) return null // ~1.5MB cap
    return { mediaType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

async function tool_trainer_bio(args: { name?: string }) {
  if (!args.name) return textContent('name is required.')
  const needle = args.name.trim().toLowerCase()
  // Match against first-name token of User.name (e.g. "Justin" → "Justin").
  const trainers = await db.trainer.findMany({
    where: { gymId: DEFAULT_GYM_ID, archived: false },
    include: { user: { select: { name: true } } },
  })
  const match = trainers.find((t) =>
    t.user.name.toLowerCase().split(/\s+/).some((tok) => tok.startsWith(needle))
  )
  if (!match) {
    return textContent(
      `No trainer found matching '${args.name}'. Call list_trainers to see who's on the team.`
    )
  }

  const structured = {
    name: match.user.name,
    title: match.title,
    bio: match.bio,
    specialties: match.specialties,
    certifications: match.certifications,
    education: match.education,
    photoUrl: match.photoUrl,
  }

  // If a photo URL is set, fetch it server-side and embed as an MCP
  // image content block. Clients that render images (Claude.ai,
  // ChatGPT) will display it inline next to the bio text.
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  > = [{ type: 'text', text: JSON.stringify(structured, null, 2) }]

  if (match.photoUrl) {
    const img = await fetchAsBase64(match.photoUrl)
    if (img) {
      content.push({ type: 'image', data: img.data, mimeType: img.mediaType })
    }
  }

  return { content, structuredContent: structured }
}

async function tool_my_sessions(athleteId: string, args: { range?: string }) {
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  const now = new Date()
  const range = args.range === 'past' ? 'past' : 'upcoming'
  const start = range === 'past' ? new Date(now.getTime() - 30 * 86400_000) : now
  const end = range === 'past' ? now : new Date(now.getTime() + 30 * 86400_000)

  const sessions = await db.session.findMany({
    where: {
      OR: [
        { athleteId },
        { attendees: { some: { athleteId } } },
      ],
      scheduledAt: { gte: start, lte: end },
      cancelled: false,
    },
    orderBy: { scheduledAt: 'asc' },
    include: {
      trainer: { include: { user: { select: { name: true } } } },
    },
  })

  return structuredContent({
    range,
    timezone: zone,
    sessions: sessions.map((s) => ({
      id: s.id,
      scheduledAt: s.scheduledAt.toISOString(),
      localTime: formatHuman(s.scheduledAt, zone),
      duration: s.duration,
      trainerName: s.trainer.user.name,
      completed: s.completed,
    })),
  })
}

async function tool_my_trainer(athleteId: string) {
  const athlete = await loadAthlete(athleteId)
  if (!athlete) return textContent('Athlete not found.')
  if (!athlete.trainer) {
    return textContent("You don't have a primary trainer assigned yet. Ask the gym owner to assign one.")
  }
  return structuredContent({
    trainerId: athlete.trainer.id,
    trainerName: athlete.trainer.user.name,
    archived: athlete.trainer.archived,
  })
}

async function tool_my_trainer_availability(
  athleteId: string,
  args: { startDate?: string; endDate?: string }
) {
  const athlete = await loadAthlete(athleteId)
  if (!athlete?.trainer) {
    return textContent("You don't have a primary trainer assigned. Can't show availability.")
  }
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  const todayLocal = startOfDayInZone(new Date(), zone)
  const start = args.startDate
    ? dateOnlyInZone(args.startDate, zone)
    : todayLocal
  const end = args.endDate
    ? dateOnlyInZone(args.endDate, zone)
    : new Date(todayLocal.getTime() + 14 * 86400_000)

  if (!start || !end) {
    return textContent('Invalid startDate or endDate. Use YYYY-MM-DD.')
  }

  const windowsByDay = await resolveAvailabilityForRange(
    athlete.trainer.id,
    start,
    end,
    zone
  )
  return structuredContent({
    trainerName: athlete.trainer.user.name,
    timezone: zone,
    timezoneNote:
      `All times below are in ${zone} (the gym's local time). ` +
      'When asking the athlete to confirm a session time, always state it in this zone.',
    days: windowsByDay.map((d) => ({
      date: d.date, // YYYY-MM-DD in gym zone
      windows: d.windows.map((w) => ({
        startMinute: w.startMinute,
        endMinute: w.endMinute,
        startTime: minutesToHHMM(w.startMinute),
        endTime: minutesToHHMM(w.endMinute),
      })),
    })),
  })
}

async function tool_suggest_slots(
  athleteId: string,
  args: {
    startDate?: string
    endDate?: string
    duration?: number
    preferredStart?: 'morning' | 'afternoon' | 'evening' | 'any'
    limit?: number
  }
) {
  const athlete = await loadAthlete(athleteId)
  if (!athlete?.trainer) {
    return textContent("You don't have a primary trainer assigned. Can't find slots.")
  }
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  const todayLocal = startOfDayInZone(new Date(), zone)
  const start = args.startDate ? dateOnlyInZone(args.startDate, zone) : todayLocal
  const end = args.endDate
    ? dateOnlyInZone(args.endDate, zone)
    : new Date(todayLocal.getTime() + 14 * 86400_000)
  if (!start || !end) {
    return textContent('Invalid startDate or endDate. Use YYYY-MM-DD.')
  }
  const duration = args.duration ?? 60
  const limit = Math.max(1, Math.min(args.limit ?? 20, 50))
  const preferredStart = args.preferredStart ?? 'any'

  // Walk zone-local days from start through end and union suggestSlots
  // for each. startOfDayInZone keeps us on the right gym-local day even
  // across DST.
  const out: { startsAt: string; localTime: string; duration: number }[] = []
  let cursor = start
  let safety = 0
  while (cursor.getTime() <= end.getTime() && safety++ < 60 && out.length < limit) {
    const daySlots = await suggestSlots({
      gymId: DEFAULT_GYM_ID,
      trainerId: athlete.trainer.id,
      date: cursor,
      duration,
      preferredStart,
    })
    // Filter out slots that are in the past (today, before now).
    const now = Date.now()
    for (const s of daySlots) {
      if (s.start.getTime() <= now) continue
      out.push({
        startsAt: s.start.toISOString(),
        localTime: formatHuman(s.start, zone),
        duration,
      })
      if (out.length >= limit) break
    }
    cursor = startOfDayInZone(new Date(cursor.getTime() + 25 * 60 * 60_000), zone)
  }

  return structuredContent({
    trainerName: athlete.trainer.user.name,
    timezone: zone,
    duration,
    preferredStart,
    note:
      'Each `startsAt` is an absolute ISO 8601 instant. To book one, pass it ' +
      'back as request_session.scheduledAt verbatim.',
    slots: out,
  })
}

async function tool_request_session(
  athleteId: string,
  args: { scheduledAt?: string; duration?: number; notes?: string }
) {
  if (!args.scheduledAt) return textContent('scheduledAt is required.')
  const scheduledAt = new Date(args.scheduledAt)
  if (isNaN(scheduledAt.getTime())) {
    return textContent('scheduledAt is not a valid ISO 8601 datetime.')
  }
  const duration = args.duration ?? 60

  const athlete = await loadAthlete(athleteId)
  if (!athlete) return textContent('Athlete not found.')
  if (athlete.archived) {
    return textContent('Your account is inactive. Contact the gym.')
  }
  if (!athlete.trainer) {
    return textContent("You don't have a primary trainer assigned. Ask the gym owner to assign one first.")
  }

  // Run the engine validator so we can warn about conflicts before
  // putting it in the owner's queue. We still create the request even
  // if there are conflicts — the owner decides — but we surface them.
  const validation = await validateBooking(DEFAULT_GYM_ID, {
    trainerId: athlete.trainer.id,
    athleteId: athlete.id,
    scheduledAt,
    duration,
  })

  const requestRow = await db.bookingRequest.create({
    data: {
      gymId: DEFAULT_GYM_ID,
      athleteId: athlete.id,
      trainerId: athlete.trainer.id,
      scheduledAt,
      duration,
      notes: args.notes ?? null,
      source: 'mcp',
      status: 'pending',
    },
  })

  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  // Athlete-facing conflict text MUST NOT name other athletes. The engine
  // attaches a sanitized `publicMessage` to any conflict that would leak
  // another client's identity; we surface that here, never the full
  // `message`. Defense-in-depth: fall back to a generic string if no
  // sanitized version was provided.
  const athleteSafeConflicts = validation.ok
    ? []
    : validation.conflicts.map(
        (c) => c.publicMessage ?? 'That slot has a conflict the gym needs to review.'
      )
  return structuredContent({
    requestId: requestRow.id,
    status: 'pending',
    scheduledAt: scheduledAt.toISOString(),
    localTime: formatHuman(scheduledAt, zone),
    timezone: zone,
    duration,
    trainerName: athlete.trainer.user.name,
    conflicts: athleteSafeConflicts,
    message: validation.ok
      ? `Request submitted to ${athlete.trainer.user.name} for ${formatHuman(scheduledAt, zone)}. You'll hear back once it's approved.`
      : `Request submitted for ${formatHuman(scheduledAt, zone)} with potential conflicts the gym owner will review.`,
  })
}

async function tool_cancel_session(athleteId: string, args: { sessionId?: string }) {
  if (!args.sessionId) return textContent('sessionId is required.')
  const session = await db.session.findUnique({ where: { id: args.sessionId } })
  if (!session) return textContent('Session not found.')
  // Athletes can only cancel sessions where they are the primary attendee.
  // Group session participants need to ask the owner.
  if (session.athleteId !== athleteId) {
    return textContent(
      "You can only cancel sessions you're the primary attendee of. Ask the gym owner for help with this one."
    )
  }
  if (session.cancelled) {
    return textContent('That session was already cancelled.')
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return textContent("Can't cancel a session that's already in the past.")
  }
  await db.session.update({
    where: { id: session.id },
    data: { cancelled: true },
  })
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  return structuredContent({
    sessionId: session.id,
    status: 'cancelled',
    scheduledAt: session.scheduledAt.toISOString(),
    localTime: formatHuman(session.scheduledAt, zone),
    timezone: zone,
  })
}

async function tool_my_pending_requests(athleteId: string) {
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  const requests = await db.bookingRequest.findMany({
    where: {
      athleteId,
      OR: [
        { status: 'pending' },
        { resolvedAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { trainer: { include: { user: { select: { name: true } } } } },
  })
  return structuredContent({
    timezone: zone,
    requests: requests.map((r) => ({
      id: r.id,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      localTime: formatHuman(r.scheduledAt, zone),
      duration: r.duration,
      trainerName: r.trainer.user.name,
      notes: r.notes,
      declineReason: r.declineReason,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
  })
}

// ---------------- Dispatch ----------------

async function callTool(
  authed: Authed,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case 'gym_overview':
      return tool_gym_overview()
    case 'list_services':
      return tool_list_services()
    case 'list_trainers':
      return tool_list_trainers_public()
    case 'trainer_bio':
      return tool_trainer_bio(args as { name?: string })
    case 'my_sessions':
      return tool_my_sessions(authed.athleteId, args as { range?: string })
    case 'my_trainer':
      return tool_my_trainer(authed.athleteId)
    case 'my_trainer_availability':
      return tool_my_trainer_availability(
        authed.athleteId,
        args as { startDate?: string; endDate?: string }
      )
    case 'suggest_slots':
      return tool_suggest_slots(
        authed.athleteId,
        args as {
          startDate?: string
          endDate?: string
          duration?: number
          preferredStart?: 'morning' | 'afternoon' | 'evening' | 'any'
          limit?: number
        }
      )
    case 'request_session':
      return tool_request_session(
        authed.athleteId,
        args as { scheduledAt?: string; duration?: number; notes?: string }
      )
    case 'cancel_session':
      return tool_cancel_session(authed.athleteId, args as { sessionId?: string })
    case 'my_pending_requests':
      return tool_my_pending_requests(authed.athleteId)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ---------------- HTTP ----------------

// MCP Streamable HTTP transport: GET is reserved for opening an SSE
// stream (server-initiated notifications). We don't emit any. Per the
// spec, when SSE isn't supported the server SHOULD return 405 — that's
// the unambiguous signal to clients that POST is the only valid method
// here. Returning 200 with our own JSON probe (as we did before) was
// non-spec and almost certainly why Claude.ai's connector card was
// showing 'disconnected' even while POST tool calls succeeded.
export async function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: 'POST' },
  })
}

export async function POST(request: NextRequest) {
  // Authenticate
  const authed = await authenticate(request)
  if (!authed) return unauthorized(request)

  // Confirm the athlete still exists & isn't archived.
  const athlete = await db.athlete.findUnique({
    where: { id: authed.athleteId },
    select: { archived: true },
  })
  if (!athlete) return unauthorized(request, 'invalid_token')
  if (athlete.archived) {
    return new NextResponse(
      JSON.stringify({ error: 'access_denied', error_description: 'Account inactive.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  let body: JsonRpcRequest | JsonRpcRequest[]
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
  }

  const isBatch = Array.isArray(body)
  const requests = (isBatch ? body : [body]) as JsonRpcRequest[]
  const responses = await Promise.all(
    requests.map((req) => handleRpc(req, authed))
  )
  // Filter notifications (no id) which produce null responses.
  const filtered = responses.filter((r) => r !== null)
  if (filtered.length === 0) {
    // All were notifications. Per spec: no response body.
    return new NextResponse(null, { status: 204 })
  }
  return NextResponse.json(isBatch ? filtered : filtered[0])
}

async function handleRpc(
  req: JsonRpcRequest,
  authed: Authed
): Promise<object | null> {
  if (!req || req.jsonrpc !== '2.0' || !req.method) {
    return rpcError(req?.id, -32600, 'Invalid request')
  }
  const isNotification = req.id === undefined

  try {
    switch (req.method) {
      case 'initialize': {
        // Per SEP-973 (Final, post-2025-06-18), Implementation may
        // include optional `icons[]` and `websiteUrl` for visual ID in
        // the client's connector list. Earlier we used `type` for the
        // MIME field — the spec actually calls it `mimeType`. That
        // typo is almost certainly why Claude.ai's connector card
        // shows the generic globe instead of our monogram (Framer and
        // the other CUSTOM-tagged connectors render their own icons,
        // so the path exists).
        const base = publicBaseUrl(null)
        const result = {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'Dallas Sports Collective',
            title: 'Dallas Sports Collective',
            version: '0.1.0',
            icons: [
              {
                src: `${base}/icon.png`,
                mimeType: 'image/png',
                sizes: '512x512',
              },
              {
                src: `${base}/apple-icon.png`,
                mimeType: 'image/png',
                sizes: '180x180',
              },
              {
                src: `${base}/logo-mark.png`,
                mimeType: 'image/png',
                sizes: '932x932',
              },
            ],
            websiteUrl: `${base}/athlete`,
          },
        }
        return isNotification ? null : rpcResult(req.id, result)
      }

      case 'notifications/initialized':
      case 'initialized':
        // Client → server notification. No response.
        return null

      case 'ping':
        return isNotification ? null : rpcResult(req.id, {})

      case 'tools/list':
        return isNotification ? null : rpcResult(req.id, { tools: TOOLS })

      case 'tools/call': {
        const params = (req.params ?? {}) as {
          name?: string
          arguments?: Record<string, unknown>
        }
        if (!params.name) {
          return rpcError(req.id, -32602, 'Missing tool name')
        }
        const result = await callTool(authed, params.name, params.arguments ?? {})
        return isNotification ? null : rpcResult(req.id, result)
      }

      default:
        return isNotification
          ? null
          : rpcError(req.id, -32601, `Method not found: ${req.method}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return isNotification ? null : rpcError(req.id, -32000, message)
  }
}
