// DELETE — undo a mis-tapped check-in.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { undoCheckIn } from '@/lib/checkin'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const r = await undoCheckIn(DEFAULT_GYM_ID, id)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
