// Direct admin session edit / cancel. PATCH re-validates through the
// engine, ignoring the session itself so moving it doesn't conflict with
// its old slot.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { validateBooking } from '@/lib/scheduling/engine'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await db.session.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
  }

  const body = await request.json()
  const nextTrainerId = body.trainerId ?? existing.trainerId
  const nextAthleteId = body.athleteId ?? existing.athleteId
  const nextScheduledAt = body.scheduledAt
    ? new Date(body.scheduledAt)
    : existing.scheduledAt
  const nextDuration = typeof body.duration === 'number' ? body.duration : existing.duration

  const validation = await validateBooking(
    DEFAULT_GYM_ID,
    {
      trainerId: nextTrainerId,
      athleteId: nextAthleteId,
      scheduledAt: nextScheduledAt,
      duration: nextDuration,
    },
    id // ignore this session's own slot when checking conflicts
  )

  if (!validation.ok) {
    return NextResponse.json({
      success: false,
      error: validation.conflicts[0]?.message ?? 'Conflict',
      conflicts: validation.conflicts,
    })
  }

  await db.session.update({
    where: { id },
    data: {
      trainerId: nextTrainerId,
      athleteId: nextAthleteId,
      scheduledAt: nextScheduledAt,
      duration: nextDuration,
      ...(typeof body.notes === 'string' ? { notes: body.notes } : {}),
    },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await db.session.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
  }

  await db.session.update({
    where: { id },
    data: { cancelled: true },
  })

  return NextResponse.json({ success: true })
}
