// Active athletes nobody has seen for a while — someone should reach out.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { absentAthletes } from '@/lib/attendance'

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: user ? 403 : 401 })
  }
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days') ?? 14), 1), 180)
  const data = await absentAthletes(DEFAULT_GYM_ID, days)
  return NextResponse.json({ success: true, data: { days, ...data } })
}
