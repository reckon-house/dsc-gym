// Extend a standing slot's materialized runway by N more weeks.
// Idempotent: if a Session already exists at a candidate slot, we skip.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { materializeStandingSlot } from '@/lib/scheduling/engine'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { slotId } = await params
  let body: { weeks?: number } = {}
  try {
    body = await request.json()
  } catch {
    /* default weeks */
  }
  const weeks = Math.max(1, Math.min(body.weeks ?? 4, 26))
  const result = await materializeStandingSlot(slotId, weeks)
  return NextResponse.json({ success: true, data: result })
}
