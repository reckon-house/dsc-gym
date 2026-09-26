import { NextRequest, NextResponse } from 'next/server'
import { deleteHealthNote, serializeHealthNote, updateHealthNote } from '@/lib/health'
import { familyTarget } from '@/lib/familyHealth'

type Ctx = { params: Promise<{ noteId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const t = await familyTarget(request)
  if (!t) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { noteId } = await params
  const body = await request.json().catch(() => ({}))
  const r = await updateHealthNote(t.athleteId, noteId, body, { role: 'family', name: t.authorName })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeHealthNote(r.note) })
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const t = await familyTarget(request)
  if (!t) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { noteId } = await params
  const r = await deleteHealthNote(t.athleteId, noteId, { role: 'family', name: t.authorName })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
