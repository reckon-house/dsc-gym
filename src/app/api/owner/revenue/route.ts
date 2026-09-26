// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, gym-local days)

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { revenueReport } from '@/lib/money'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { dateOnlyInZone } from '@/lib/scheduling/timezone'

export async function GET(request: NextRequest) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const q = request.nextUrl.searchParams
  const zone = await getGymTimezone(DEFAULT_GYM_ID)
  const from = dateOnlyInZone(q.get('from') ?? '', zone)
  const toDay = dateOnlyInZone(q.get('to') ?? '', zone)
  if (!from || !toDay || toDay < from) {
    return NextResponse.json({ success: false, error: 'Pick a valid date range.' }, { status: 400 })
  }
  const to = new Date(toDay.getTime() + 86400_000)
  return NextResponse.json({ success: true, data: await revenueReport(DEFAULT_GYM_ID, from, to) })
}
