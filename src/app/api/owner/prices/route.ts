// Price sheet (owners). GET everything the prices tab needs; POST a line.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { parsePriceItem } from '@/lib/priceInput'

export async function GET() {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const [items, groups, config] = await Promise.all([
    db.priceItem.findMany({ where: { gymId: DEFAULT_GYM_ID }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.group.findMany({
      where: { gymId: DEFAULT_GYM_ID, active: true },
      select: { id: true, name: true, priceCents: true },
      orderBy: { name: 'asc' },
    }),
    db.gymConfig.findUnique({
      where: { gymId: DEFAULT_GYM_ID },
      select: { billingStartDate: true, pricingNote: true, noShowPolicy: true },
    }),
  ])
  return NextResponse.json({
    success: true,
    data: {
      items,
      groups,
      settings: {
        billingStartDate: config?.billingStartDate?.toISOString().slice(0, 10) ?? null,
        pricingNote: config?.pricingNote ?? null,
        chargeNoShows: config?.noShowPolicy === 'charge',
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => ({}))
  const p = parsePriceItem(body, false)
  if ('error' in p) return NextResponse.json({ success: false, error: p.error }, { status: 400 })
  const item = await db.priceItem.create({
    data: { gymId: DEFAULT_GYM_ID, ...(p.data as { name: string; priceCents: number }) },
  })
  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
