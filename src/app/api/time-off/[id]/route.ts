// PATCH /api/time-off/[id]  { action: 'approve' | 'decline' | 'cancel', note? }
// Approve/decline are admin-only. Cancel: a coach may withdraw their own
// pending request; an admin may also cancel an approved one (unblocks it).

import { NextRequest, NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { approveTimeOff, cancelTimeOff, declineTimeOff } from '@/lib/timeOff'
import { notifyTimeOffDecided } from '@/lib/notify'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null

  if (body.action === 'cancel') {
    const r = await cancelTimeOff(id, { role: user.role, trainerId: user.trainerId, gymId: DEFAULT_GYM_ID })
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Only an admin can decide time off.' }, { status: 403 })
  }

  if (body.action === 'approve') {
    const r = await approveTimeOff(id, DEFAULT_GYM_ID, user.userId, note)
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    after(() => notifyTimeOffDecided(id))
    return NextResponse.json({ success: true, data: { stranded: r.stranded } })
  }
  if (body.action === 'decline') {
    const r = await declineTimeOff(id, DEFAULT_GYM_ID, user.userId, note)
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    after(() => notifyTimeOffDecided(id))
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 })
}
