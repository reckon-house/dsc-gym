// POST { message? } — flag an existing injury for the PT.

import { NextRequest, NextResponse, after } from 'next/server'
import { requireStaff } from '@/lib/staffApi'
import { flagForPT } from '@/lib/ptFollowups'
import { notifyPtFlagged } from '@/lib/notify'

export async function POST(request: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const a = await requireStaff()
  if ('error' in a) return a.error
  const { noteId } = await params
  const body = await request.json().catch(() => ({}))
  const r = await flagForPT(noteId, { userId: a.user.userId, name: a.user.name }, body.message)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  after(() => notifyPtFlagged(noteId))
  return NextResponse.json({ success: true })
}
