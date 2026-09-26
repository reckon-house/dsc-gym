// One athlete's billing. GET the picture; PATCH { billingPlan?, paidThrough?, billingNote? }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { athleteBilling } from '@/lib/money'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  return NextResponse.json({ success: true, data: await athleteBilling(DEFAULT_GYM_ID, id) })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const { id } = await params
  const athlete = await db.athlete.findUnique({ where: { id }, select: { gymId: true } })
  if (!athlete || athlete.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Athlete not found.' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.billingPlan !== undefined) {
    if (!['per_session', 'monthly', 'comp'].includes(body.billingPlan)) {
      return NextResponse.json({ success: false, error: 'Unknown plan.' }, { status: 400 })
    }
    data.billingPlan = body.billingPlan
  }
  if (body.paidThrough !== undefined) {
    if (body.paidThrough === null || body.paidThrough === '') data.paidThrough = null
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.paidThrough))) data.paidThrough = new Date(`${body.paidThrough}T00:00:00Z`)
    else return NextResponse.json({ success: false, error: 'Date must be YYYY-MM-DD.' }, { status: 400 })
  }
  if (body.billingNote !== undefined) {
    data.billingNote = typeof body.billingNote === 'string' && body.billingNote.trim() ? body.billingNote.trim().slice(0, 300) : null
  }
  await db.athlete.update({ where: { id }, data })
  return NextResponse.json({ success: true })
}
