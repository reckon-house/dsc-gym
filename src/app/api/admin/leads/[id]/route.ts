import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { possibleDuplicates, updateLead } from '@/lib/leads'
import { requireAdmin, serializeLead } from '@/lib/leadApi'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id }, include: { notes: { orderBy: { createdAt: 'desc' } } } })
  if (!lead || lead.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 })
  }
  return NextResponse.json({
    success: true,
    data: serializeLead(lead),
    duplicates: await possibleDuplicates(DEFAULT_GYM_ID, lead),
  })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await updateLead(DEFAULT_GYM_ID, id, body, { name: a.user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeLead(r.lead) })
}

/** Hard delete, for junk and duplicates. Real leads should be marked lost. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const a = await requireAdmin()
  if ('error' in a) return a.error
  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead || lead.gymId !== DEFAULT_GYM_ID) {
    return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 })
  }
  await db.lead.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
