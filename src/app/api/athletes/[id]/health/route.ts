// Staff view of an athlete's health notes. Any coach can read and write them,
// not only the athlete's assigned trainer: whoever is running the session is
// the one who needs to know about the sprained ankle.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createHealthNote, listHealthNotes, serializeHealthNote } from '@/lib/health'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const notes = await listHealthNotes(id)
  return NextResponse.json({ success: true, data: notes.map(serializeHealthNote) })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await createHealthNote(id, body, { role: 'staff', name: user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeHealthNote(r.note) })
}
