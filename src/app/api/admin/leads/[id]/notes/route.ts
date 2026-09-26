// POST { body, contacted?: boolean, followUpOn?: 'YYYY-MM-DD' | null }
// Logging a call and setting the next follow-up is one action, not three.

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { addLeadNote } from '@/lib/leads'
import { requireAdmin, serializeLead } from '@/lib/leadApi'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await addLeadNote(DEFAULT_GYM_ID, id, body.body, { name: a.user.name }, {
    contacted: Boolean(body.contacted),
    followUpOn: body.followUpOn,
  })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeLead(r.lead) })
}
