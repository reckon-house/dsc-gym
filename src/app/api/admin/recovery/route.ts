// Recovery room usage. The gym bills outside the app, so this is a log plus a
// monthly per-athlete total — not a payment integration.

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
  // Two ways in: a month (YYYY-MM) for the charges page, or an explicit
  // from/to window for the calendar, which needs one local day and can't
  // express that as a month.
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  let from: Date
  let to: Date
  let month: string

  if (fromParam && toParam) {
    from = new Date(fromParam)
    to = new Date(toParam)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json(
        { success: false, error: 'from and to must be ISO datetimes.' },
        { status: 400 }
      )
    }
    month = fromParam.slice(0, 7)
  } else {
    month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) {
      return NextResponse.json({ success: false, error: 'month must be YYYY-MM.' }, { status: 400 })
    }
    from = new Date(Date.UTC(y, m - 1, 1))
    to = new Date(Date.UTC(y, m, 1))
  }

  const config = await db.gymConfig.findUnique({ where: { gymId: DEFAULT_GYM_ID } })

  const visits = await db.recoveryVisit.findMany({
    where: { gymId: DEFAULT_GYM_ID, at: { gte: from, lt: to } },
    include: { athlete: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { at: 'desc' },
  })

  const byAthlete = new Map<
    string,
    { athleteId: string; name: string; visits: number; totalCents: number }
  >()
  for (const v of visits) {
    const key = v.athleteId
    const row = byAthlete.get(key) ?? {
      athleteId: key,
      name: `${v.athlete.firstName} ${v.athlete.lastName}`,
      visits: 0,
      totalCents: 0,
    }
    row.visits++
    row.totalCents += v.priceCents
    byAthlete.set(key, row)
  }

  return NextResponse.json({
    success: true,
    data: {
      month,
      visits,
      totals: [...byAthlete.values()].sort((a, b) => b.totalCents - a.totalCents),
      grandTotalCents: visits.reduce((n, v) => n + v.priceCents, 0),
      // Sent along so the logging form can prefill and show the going rate
      // rather than making the owner remember it.
      defaultPriceCents: config?.recoveryPriceCents ?? 2500,
    },
  })
}

// Change the default recovery-room price. Past visits keep the price they were
// logged at — this is a going-forward rate, not a retroactive repricing.
export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const priceCents = Number(body.defaultPriceCents)
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json(
      { success: false, error: 'defaultPriceCents must be a whole number of cents.' },
      { status: 400 }
    )
  }
  const config = await db.gymConfig.upsert({
    where: { gymId: DEFAULT_GYM_ID },
    create: { gymId: DEFAULT_GYM_ID, recoveryPriceCents: priceCents },
    update: { recoveryPriceCents: priceCents },
  })
  return NextResponse.json({ success: true, data: { defaultPriceCents: config.recoveryPriceCents } })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const athleteId = String(body.athleteId ?? '')
  if (!athleteId) {
    return NextResponse.json({ success: false, error: 'athleteId is required.' }, { status: 400 })
  }
  const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) {
    return NextResponse.json({ success: false, error: 'Athlete not found.' }, { status: 404 })
  }

  const config = await db.gymConfig.findUnique({ where: { gymId: DEFAULT_GYM_ID } })
  const priceCents =
    body.priceCents !== undefined ? Number(body.priceCents) : (config?.recoveryPriceCents ?? 2500)

  const visit = await db.recoveryVisit.create({
    data: {
      gymId: DEFAULT_GYM_ID,
      athleteId,
      at: body.at ? new Date(body.at) : new Date(),
      priceCents,
      note: body.note ? String(body.note) : null,
      createdBy: session.userId,
    },
  })
  return NextResponse.json({ success: true, data: visit }, { status: 201 })
}
