// Attendance rollup for a week, a month, or an explicit range.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { attendanceReport, thisWeek, monthRange } from '@/lib/reports'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'week'
  const zone = await getGymTimezone(DEFAULT_GYM_ID)

  let range: { from: Date; to: Date; label: string }
  if (period === 'month') {
    range = monthRange(new Date())
  } else if (period === 'custom') {
    const from = new Date(searchParams.get('from') ?? '')
    const to = new Date(searchParams.get('to') ?? '')
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json(
        { success: false, error: 'from and to must be ISO dates.' },
        { status: 400 }
      )
    }
    range = { from, to, label: 'Custom range' }
  } else {
    range = thisWeek(zone)
  }

  const data = await attendanceReport(DEFAULT_GYM_ID, range.from, range.to, range.label)
  return NextResponse.json({ success: true, data })
}
