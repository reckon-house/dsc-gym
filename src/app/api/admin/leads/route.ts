// Leads / waitlist. GET ?status=new,contacted &due=1 &q=search  POST {...lead, note?}

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { createLead, leadSummary, listLeads, LEAD_STATUSES, type LeadStatus } from '@/lib/leads'
import { requireAdmin, serializeLead } from '@/lib/leadApi'

export async function GET(request: NextRequest) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const q = request.nextUrl.searchParams
  const status = (q.get('status') ?? '')
    .split(',')
    .filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s))
  const [rows, summary] = await Promise.all([
    listLeads(DEFAULT_GYM_ID, {
      status: status.length ? status : undefined,
      due: q.get('due') === '1',
      search: q.get('q') ?? undefined,
    }),
    leadSummary(DEFAULT_GYM_ID),
  ])
  return NextResponse.json({ success: true, data: rows.map(serializeLead), summary })
}

export async function POST(request: NextRequest) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => ({}))
  const r = await createLead(DEFAULT_GYM_ID, body, { userId: a.user.userId, name: a.user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeLead(r.lead), duplicates: r.duplicates }, { status: 201 })
}
