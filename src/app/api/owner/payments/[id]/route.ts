// DELETE voids a payment (kept, marked reversed).

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { voidPayment } from '@/lib/money'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  const r = await voidPayment(DEFAULT_GYM_ID, id)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
