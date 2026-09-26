// Public price list: the lines the owners marked public. Empty until they do,
// and the pricing page hides itself when it is.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
  const [items, config] = await Promise.all([
    db.priceItem.findMany({
      where: { gymId: DEFAULT_GYM_ID, active: true, isPublic: true },
      select: { id: true, name: true, priceCents: true, unit: true, durationMinutes: true, sessionsIncluded: true, description: true, classType: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.gymConfig.findUnique({ where: { gymId: DEFAULT_GYM_ID }, select: { pricingNote: true } }),
  ])
  return NextResponse.json({ success: true, data: { items, note: config?.pricingNote ?? null } })
}
