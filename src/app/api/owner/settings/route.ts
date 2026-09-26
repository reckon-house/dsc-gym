// PATCH { billingStartDate?: 'YYYY-MM-DD' | null, pricingNote?, chargeNoShows? }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'

export async function PATCH(request: NextRequest) {
  const a = await requireOwner()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body.billingStartDate !== undefined) {
    if (body.billingStartDate === null || body.billingStartDate === '') data.billingStartDate = null
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.billingStartDate))) {
      data.billingStartDate = new Date(`${body.billingStartDate}T00:00:00Z`)
    } else return NextResponse.json({ success: false, error: 'Date must be YYYY-MM-DD.' }, { status: 400 })
  }
  if (body.pricingNote !== undefined) {
    data.pricingNote = typeof body.pricingNote === 'string' && body.pricingNote.trim() ? body.pricingNote.trim().slice(0, 300) : null
  }
  if (body.chargeNoShows !== undefined) data.noShowPolicy = body.chargeNoShows ? 'charge' : 'flag_only'
  await db.gymConfig.update({ where: { gymId: DEFAULT_GYM_ID }, data })
  return NextResponse.json({ success: true })
}
