// Injury follow-ups between coaches and the PT. Staff only.
//
// GET  ?view=open|cleared   the list, plus athlete names for reporting
// POST { athleteId, title, details?, flag?, message? }   report an injury

import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireStaff } from '@/lib/staffApi'
import { listFollowups, ptUsers, reportInjury } from '@/lib/ptFollowups'
import { notifyPtFlagged } from '@/lib/notify'

export async function GET(request: NextRequest) {
  const a = await requireStaff()
  if ('error' in a) return a.error
  const view = request.nextUrl.searchParams.get('view') === 'cleared' ? 'cleared' : 'open'
  const [items, athletes, pts, me] = await Promise.all([
    listFollowups(DEFAULT_GYM_ID, view),
    db.athlete.findMany({
      where: { gymId: DEFAULT_GYM_ID, archived: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    ptUsers(),
    db.user.findUnique({ where: { id: a.user.userId }, select: { isPT: true } }),
  ])
  return NextResponse.json({
    success: true,
    data: { items, athletes, ptNames: pts.map((p) => p.name), iAmPT: Boolean(me?.isPT) },
  })
}

export async function POST(request: NextRequest) {
  const a = await requireStaff()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => ({}))
  const r = await reportInjury(body, { userId: a.user.userId, name: a.user.name })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  if (body.flag !== false) after(() => notifyPtFlagged(r.noteId))
  return NextResponse.json({ success: true, data: { noteId: r.noteId } }, { status: 201 })
}
