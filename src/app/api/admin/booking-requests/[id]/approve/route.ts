// Approve a BookingRequest. Re-validates through the engine and, if
// clean, creates the actual Session. Marks the request approved and
// links it to the resulting sessionId.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBooking } from '@/lib/scheduling/engine'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = request.headers.get('x-user-id') || null

  const req = await db.bookingRequest.findUnique({ where: { id } })
  if (!req) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (req.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Already ${req.status}.` },
      { status: 400 }
    )
  }

  const validation = await validateBooking(DEFAULT_GYM_ID, {
    trainerId: req.trainerId,
    athleteId: req.athleteId,
    scheduledAt: req.scheduledAt,
    duration: req.duration,
  })

  if (!validation.ok) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      conflicts: validation.conflicts,
    }, { status: 409 })
  }

  const session = await db.session.create({
    data: {
      gymId: req.gymId,
      trainerId: req.trainerId,
      athleteId: req.athleteId,
      scheduledAt: req.scheduledAt,
      duration: req.duration,
      notes: req.notes,
    },
  })

  await db.bookingRequest.update({
    where: { id },
    data: {
      status: 'approved',
      resolvedAt: new Date(),
      resolvedBy: userId,
      sessionId: session.id,
    },
  })

  return NextResponse.json({ success: true, sessionId: session.id })
}
