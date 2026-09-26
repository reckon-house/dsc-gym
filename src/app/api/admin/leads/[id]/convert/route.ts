// POST { lastName?, trainerId?, addToGroup? } — make the lead an athlete.

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { convertLead } from '@/lib/leads'
import { requireAdmin } from '@/lib/leadApi'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await convertLead(
    DEFAULT_GYM_ID,
    id,
    {
      lastName: typeof body.lastName === 'string' ? body.lastName : null,
      trainerId: typeof body.trainerId === 'string' ? body.trainerId : null,
      addToGroup: body.addToGroup !== false,
    },
    { name: a.user.name }
  )
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: r })
}
