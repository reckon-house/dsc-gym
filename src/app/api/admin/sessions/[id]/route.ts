// Direct admin session edit / cancel. PATCH re-validates through the
// engine, ignoring the session itself so moving it doesn't conflict with
// its old slot.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { validateBooking, addSessionAttendee, removeSessionAttendee } from '@/lib/scheduling/engine'

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

  // Attendee edits are their own operation, handled before (and separately
  // from) any reschedule. They must NOT go through validateBooking: adding a
  // body to a session that already exists would collide with that very
  // session and report the coach as busy. See addSessionAttendee.
  const addIds: string[] = Array.isArray(body.addAthleteIds) ? body.addAthleteIds.map(String) : []
  const removeIds: string[] = Array.isArray(body.removeAthleteIds)
    ? body.removeAthleteIds.map(String)
    : []
  if (addIds.length || removeIds.length) {
    const problems: string[] = []
    for (const athleteId of addIds) {
      const r = await addSessionAttendee(DEFAULT_GYM_ID, id, athleteId)
      if (!r.ok && r.error) problems.push(r.error)
    }
    for (const athleteId of removeIds) {
      const r = await removeSessionAttendee(DEFAULT_GYM_ID, id, athleteId)
      if (!r.ok && r.error) problems.push(r.error)
    }
    if (problems.length) {
      return NextResponse.json({ success: false, error: problems[0], problems }, { status: 409 })
    }
    // An attendee-only edit is complete; nothing to reschedule.
    if (
      body.trainerId === undefined &&
      body.athleteId === undefined &&
      body.scheduledAt === undefined &&
      body.duration === undefined &&
      body.notes === undefined
    ) {
      return NextResponse.json({ success: true })
    }
  }

  const nextTrainerId = body.trainerId ?? existing.trainerId
  const fresh = await db.session.findUnique({ where: { id } })
  const nextAthleteId = body.athleteId ?? fresh?.athleteId ?? existing.athleteId
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
