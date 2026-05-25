// Athlete reads their own booking-request activity:
//   - Pending requests
//   - Approvals / declines from the last 7 days (so the dashboard can
//     surface "approved Tuesday" without showing forever-old history)
//
// Auth: athleteSession cookie, same pattern as /api/athletes/me/sessions.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { formatHuman } from '@/lib/scheduling/timezone'
import { DEFAULT_GYM_ID } from '@/lib/constants'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let athleteId: string
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.role !== 'ATHLETE' || !payload.athleteId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    athleteId = payload.athleteId as string
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)
  const rows = await db.bookingRequest.findMany({
    where: {
      athleteId,
      OR: [
        { status: 'pending' },
        { resolvedAt: { gte: sevenDaysAgo } },
      ],
    },
    orderBy: [
      // pending first, then most-recent activity
      { status: 'asc' },
      { updatedAt: 'desc' },
    ],
    include: { trainer: { include: { user: { select: { name: true } } } } },
    take: 20,
  })

  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  return NextResponse.json({
    success: true,
    timezone: zone,
    data: rows.map((r) => ({
      id: r.id,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      localTime: formatHuman(r.scheduledAt, zone),
      duration: r.duration,
      trainerName: r.trainer.user.name,
      notes: r.notes,
      declineReason: r.declineReason,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      source: r.source,
    })),
  })
}
