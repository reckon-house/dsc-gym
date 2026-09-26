// Front-desk check-in for registered athletes. Any staff member can do it —
// whoever is standing at the door.
//
// GET  today's check-ins + every active athlete (names only) to search
// POST { athleteId }

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { staffCheckIn, todaysCheckIns } from '@/lib/checkin'

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const [today, athletes] = await Promise.all([
    todaysCheckIns(DEFAULT_GYM_ID),
    db.athlete.findMany({
      where: { gymId: DEFAULT_GYM_ID, archived: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])
  return NextResponse.json({ success: true, data: { today, athletes } })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const r = await staffCheckIn(DEFAULT_GYM_ID, String(body.athleteId ?? ''), user.userId)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: r })
}
