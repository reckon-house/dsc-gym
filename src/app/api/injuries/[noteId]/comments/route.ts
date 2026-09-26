// POST { body } — reply in the staff-only thread.

import { NextRequest, NextResponse, after } from 'next/server'
import { requireStaff } from '@/lib/staffApi'
import { addComment } from '@/lib/ptFollowups'
import { notifyPtComment } from '@/lib/notify'

export async function POST(request: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const a = await requireStaff()
  if ('error' in a) return a.error
  const { noteId } = await params
  const body = await request.json().catch(() => ({}))
  const r = await addComment(noteId, body.body, { userId: a.user.userId, name: a.user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  const commentId = r.commentId
  after(() => notifyPtComment(commentId))
  return NextResponse.json({ success: true })
}
