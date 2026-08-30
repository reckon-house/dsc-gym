// Company calendar: staff meetings that sit alongside training sessions.
//
// Separate from Session on purpose — see the CalendarEvent model comment.
// Meetings block their trainers from being booked (engine rule 4b).

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const events = await db.calendarEvent.findMany({
    where: {
      gymId: DEFAULT_GYM_ID,
      cancelled: false,
      ...(startDate && endDate
        ? { startsAt: { gte: new Date(startDate), lt: new Date(endDate) } }
        : {}),
    },
    orderBy: { startsAt: 'asc' },
  })
  return NextResponse.json({ success: true, data: events })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can add meetings.' },
      { status: session ? 403 : 401 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title || !body.startsAt) {
    return NextResponse.json(
      { success: false, error: 'title and startsAt are required.' },
      { status: 400 }
    )
  }

  const startsAt = new Date(body.startsAt)
  const duration = Number(body.duration ?? 60)
  const trainerIds: string[] = Array.isArray(body.trainerIds) ? body.trainerIds.map(String) : []

  // Sessions that clash are reported but NOT blocking: the owner scheduling a
  // meeting usually intends to move the training around it, and refusing would
  // just send them off to cancel things first.
  const dayStart = new Date(startsAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  const end = new Date(startsAt.getTime() + duration * 60_000)
  const sameDay = await db.session.findMany({
    where: {
      gymId: DEFAULT_GYM_ID,
      cancelled: false,
      scheduledAt: { gte: dayStart, lt: dayEnd },
      ...(trainerIds.length ? { trainerId: { in: trainerIds } } : {}),
    },
    include: { trainer: { include: { user: true } }, athlete: true },
  })
  const warnings = sameDay
    .filter((s) => {
      const sEnd = new Date(s.scheduledAt.getTime() + s.duration * 60_000)
      return s.scheduledAt < end && sEnd > startsAt
    })
    .map((s) => `${s.trainer.user.name} has ${s.athlete.firstName} ${s.athlete.lastName} at that time`)

  const event = await db.calendarEvent.create({
    data: {
      gymId: DEFAULT_GYM_ID,
      title,
      description: body.description ? String(body.description) : null,
      startsAt,
      duration,
      trainerIds,
      createdBy: session.userId,
    },
  })
  return NextResponse.json({ success: true, data: event, warnings }, { status: 201 })
}
