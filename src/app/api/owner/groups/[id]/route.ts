// PATCH { price: number | null } — a group's own per-athlete session price.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { parseDollars } from '@/lib/money'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  const group = await db.group.findUnique({ where: { id } })
  if (!group || group.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Group not found.' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  let priceCents: number | null = null
  if (body.price !== null && body.price !== '') {
    priceCents = parseDollars(body.price)
    if (priceCents === null) return NextResponse.json({ success: false, error: 'Enter a price, like 25.' }, { status: 400 })
  }
  await db.group.update({ where: { id }, data: { priceCents } })
  return NextResponse.json({ success: true })
}
