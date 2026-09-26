// One athlete's visit history: attended, no-shows, drop-ins, kiosk check-ins.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { visitHistory } from '@/lib/attendance'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const athlete = await db.athlete.findUnique({ where: { id }, select: { trainerId: true } })
  if (!athlete) return NextResponse.json({ success: false, error: 'Athlete not found' }, { status: 404 })
  if (user.role === 'TRAINER' && athlete.trainerId !== user.trainerId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ success: true, data: await visitHistory(id) })
}
