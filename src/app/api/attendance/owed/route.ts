// Sessions the signed-in coach still owes attendance on (admins: everyone's).

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { attendanceOwed } from '@/lib/attendance'
import { sessionRoster, rosterLabel } from '@/lib/sessionRoster'

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  // ?mine=1 lets an admin who also coaches see just their own.
  const mine = new URL(request.url).searchParams.get('mine') === '1'
  const trainerId = user.role === 'ADMIN' && !mine ? null : (user.trainerId ?? null)
  if (user.role !== 'ADMIN' && !trainerId) return NextResponse.json({ success: true, data: [] })

  const rows = await attendanceOwed(DEFAULT_GYM_ID, trainerId)
  return NextResponse.json({
    success: true,
    data: rows.map((s) => {
      const roster = sessionRoster(s)
      return {
        id: s.id,
        scheduledAt: s.scheduledAt,
        duration: s.duration,
        coach: s.trainer.user.name,
        label: rosterLabel(roster, s.group?.name),
        count: roster.length,
      }
    }),
  })
}
