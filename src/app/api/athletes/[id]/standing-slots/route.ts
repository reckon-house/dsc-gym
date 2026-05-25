// CRUD for an athlete's standing weekly slots.
//
// GET: list all (active + inactive) slots for the athlete
// POST: create a new slot; auto-materializes weeks (default 8)

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { materializeStandingSlot } from '@/lib/scheduling/engine'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const slots = await db.athleteStandingSlot.findMany({
    where: { athleteId: id },
    orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  })
  return NextResponse.json({ success: true, data: slots })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { id: athleteId } = await params
  let body: {
    trainerId?: string
    dayOfWeek?: number
    startMinute?: number
    duration?: number
    notes?: string | null
    weeksToMaterialize?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  if (
    !body.trainerId ||
    typeof body.dayOfWeek !== 'number' ||
    typeof body.startMinute !== 'number'
  ) {
    return NextResponse.json(
      { success: false, error: 'trainerId, dayOfWeek (0-6), startMinute required' },
      { status: 400 }
    )
  }
  if (body.dayOfWeek < 0 || body.dayOfWeek > 6) {
    return NextResponse.json(
      { success: false, error: 'dayOfWeek must be 0..6 (Sun..Sat)' },
      { status: 400 }
    )
  }
  const duration = body.duration ?? 60

  const slot = await db.athleteStandingSlot.create({
    data: {
      athleteId,
      trainerId: body.trainerId,
      dayOfWeek: body.dayOfWeek,
      startMinute: body.startMinute,
      duration,
      notes: body.notes ?? null,
      active: true,
    },
  })

  // Materialize a runway of real Sessions so the schedule reflects the
  // standing commitment. Default 8 weeks.
  const weeks = Math.max(1, Math.min(body.weeksToMaterialize ?? 8, 26))
  const result = await materializeStandingSlot(slot.id, weeks)

  return NextResponse.json(
    { success: true, data: { slot, materialized: result } },
    { status: 201 }
  )
}
