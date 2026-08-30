// Athletes turning up more than they're scheduled.
//
// The signal already existed: /api/checkin writes CheckIn{matched:false,
// sessionId:null} when a known athlete checks in with no session that day.
// Nothing ever read it back.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
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
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30), 1), 365)
  const since = new Date(Date.now() - days * 86400_000)

  const grouped = await db.checkIn.groupBy({
    by: ['athleteId'],
    where: { gymId: DEFAULT_GYM_ID, matched: false, checkInTime: { gte: since } },
    _count: { _all: true },
    _max: { checkInTime: true },
  })

  const ids = grouped.map((g) => g.athleteId).filter((x): x is string => !!x)
  const athletes = await db.athlete.findMany({
    where: { id: { in: ids }, archived: false },
    select: { id: true, firstName: true, lastName: true, trainer: { select: { user: { select: { name: true } } } } },
  })
  const byId = new Map(athletes.map((a) => [a.id, a]))

  const rows = grouped
    .filter((g) => g.athleteId && byId.has(g.athleteId))
    .map((g) => {
      const a = byId.get(g.athleteId!)!
      return {
        athleteId: a.id,
        name: `${a.firstName} ${a.lastName}`,
        trainerName: a.trainer?.user.name ?? null,
        extraVisits: g._count._all,
        lastVisit: g._max.checkInTime,
      }
    })
    .sort((a, b) => b.extraVisits - a.extraVisits)

  return NextResponse.json({ success: true, data: { days, rows } })
}
