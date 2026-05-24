// Athlete reads their own upcoming sessions. Auth via athleteSession cookie.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'

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

  const now = new Date()
  const sessions = await db.session.findMany({
    where: {
      athleteId,
      scheduledAt: { gte: now },
      cancelled: false,
    },
    include: { trainer: { include: { user: { select: { name: true } } } } },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  })

  return NextResponse.json({
    success: true,
    data: sessions.map((s) => ({
      id: s.id,
      scheduledAt: s.scheduledAt.toISOString(),
      duration: s.duration,
      trainerName: s.trainer.user.name,
    })),
  })
}
