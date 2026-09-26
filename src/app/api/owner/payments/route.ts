// POST { athleteId, amount, paidOn?, method?, note?, coversThrough? }

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { recordPayment } from '@/lib/money'

export async function POST(request: NextRequest) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => ({}))
  const r = await recordPayment(DEFAULT_GYM_ID, { ...body, athleteId: String(body.athleteId ?? '') }, a.user.userId)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: { id: r.payment.id } }, { status: 201 })
}
