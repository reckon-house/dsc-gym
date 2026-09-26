// POST { status: 'following' | 'cleared' | 'reopen' }

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staffApi'
import { setPtStatus } from '@/lib/ptFollowups'

export async function POST(request: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const a = await requireStaff()
  if ('error' in a) return a.error
  const { noteId } = await params
  const body = await request.json().catch(() => ({}))
  if (!['following', 'cleared', 'reopen'].includes(body.status)) {
    return NextResponse.json({ success: false, error: 'Unknown status.' }, { status: 400 })
  }
  const r = await setPtStatus(noteId, body.status, { userId: a.user.userId, name: a.user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
