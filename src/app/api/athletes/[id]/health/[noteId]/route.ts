import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { deleteHealthNote, serializeHealthNote, updateHealthNote } from '@/lib/health'

type Ctx = { params: Promise<{ id: string; noteId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id, noteId } = await params
  const body = await request.json().catch(() => ({}))
  const r = await updateHealthNote(id, noteId, body, { role: 'staff', name: user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeHealthNote(r.note) })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id, noteId } = await params
  const r = await deleteHealthNote(id, noteId, { role: 'staff', name: user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
