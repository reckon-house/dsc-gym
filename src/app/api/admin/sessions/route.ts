// Direct admin session create — bypasses chat/proposal flow when the
// owner wants to tap-and-edit. STILL goes through the engine's
// validateBooking so rules + conflicts are honored.

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { notifySessionBooked } from '@/lib/notify'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { validateBooking } from '@/lib/scheduling/engine'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { trainerId, athleteId, scheduledAt, duration, notes } = body
  if (!trainerId || !athleteId || !scheduledAt) {
    return NextResponse.json(
      { success: false, error: 'trainerId, athleteId, scheduledAt are required' },
      { status: 400 }
    )
  }

  const at = new Date(scheduledAt)
  const dur = typeof duration === 'number' ? duration : 60

  const validation = await validateBooking(DEFAULT_GYM_ID, {
    trainerId,
    athleteId,
    scheduledAt: at,
    duration: dur,
  }, undefined, { allowPast: Boolean(body.allowPast) })

  if (!validation.ok) {
    return NextResponse.json({
      success: false,
      error: validation.conflicts[0]?.message ?? 'Conflict',
      conflicts: validation.conflicts,
    })
  }

  const created = await db.session.create({
    data: {
      gymId: DEFAULT_GYM_ID,
      trainerId,
      athleteId,
      scheduledAt: at,
      duration: dur,
      notes: typeof notes === 'string' ? notes : null,
      // This route used to create no attendee row at all, unlike
      // POST /api/sessions. That left admin-made sessions invisible to
      // anything that reads the roster from SessionAttendee.
      attendees: { create: [{ athleteId }] },
    },
  })

  // Tell the athlete and the trainer. after() so the response isn't held open
  // on Resend, and so Vercel doesn't kill the send mid-flight.
  after(() => notifySessionBooked(created.id))

  return NextResponse.json({ success: true, sessionId: created.id })
}
