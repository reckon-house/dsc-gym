import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { parsePriceItem } from '@/lib/priceInput'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  const existing = await db.priceItem.findUnique({ where: { id } })
  if (!existing || existing.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const p = parsePriceItem(body, true)
  if ('error' in p) return NextResponse.json({ success: false, error: p.error }, { status: 400 })
  const item = await db.priceItem.update({ where: { id }, data: p.data })
  return NextResponse.json({ success: true, data: item })
}

// Prices are derived at report time, so deleting a line just re-prices.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  const existing = await db.priceItem.findUnique({ where: { id } })
  if (!existing || existing.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 })
  }
  await db.priceItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
