// A family's view of their own athlete's health notes. ?athleteId= picks a
// sibling on the same login; it must be one of theirs.

import { NextRequest, NextResponse } from 'next/server'
import { familyTarget } from '@/lib/familyHealth'
import { createHealthNote, listHealthNotes, serializeHealthNote } from '@/lib/health'

export async function GET(request: NextRequest) {
  const t = await familyTarget(request)
  if (!t) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const notes = await listHealthNotes(t.athleteId)
  return NextResponse.json({ success: true, data: notes.map(serializeHealthNote) })
}

export async function POST(request: NextRequest) {
  const t = await familyTarget(request)
  if (!t) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const r = await createHealthNote(t.athleteId, body, { role: 'family', name: t.authorName })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: serializeHealthNote(r.note) })
}
