// Decline a request for a spot in a class.
//
// The reason is optional but goes into the email verbatim, so "we're moving
// you to the Thursday group instead" reaches the parent rather than a bare no.

import { NextRequest, NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { notifyGroupJoinResolved } from '@/lib/notify'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can decline class requests.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason = body.reason ? String(body.reason).slice(0, 500) : null

  const declined = await db.groupJoinRequest.updateMany({
    where: { id, status: 'pending' },
    data: {
      status: 'declined',
      declineReason: reason,
      resolvedAt: new Date(),
      resolvedBy: session.userId,
    },
  })
  if (declined.count !== 1) {
    return NextResponse.json(
      { success: false, error: 'That request is no longer pending.' },
      { status: 409 }
    )
  }

  after(() => notifyGroupJoinResolved(id, 'declined'))
  return NextResponse.json({ success: true })
}
