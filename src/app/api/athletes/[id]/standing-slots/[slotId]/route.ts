// Per-slot ops: toggle active, update notes, delete.
//
// Deleting a slot does NOT cancel already-materialized future sessions.
// Those are real bookings and the admin/trainer can cancel them
// individually if needed. The slot row is just the recurrence rule.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { slotId } = await params
  let body: { active?: boolean; notes?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const updateData: { active?: boolean; notes?: string | null } = {}
  if (typeof body.active === 'boolean') updateData.active = body.active
  if (body.notes !== undefined) updateData.notes = body.notes
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { success: false, error: 'Nothing to update.' },
      { status: 400 }
    )
  }
  const updated = await db.athleteStandingSlot.update({
    where: { id: slotId },
    data: updateData,
  })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { slotId } = await params
  await db.athleteStandingSlot.delete({ where: { id: slotId } })
  return NextResponse.json({ success: true })
}
