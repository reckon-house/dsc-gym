// Approve a request for a spot in a class.
//
// The roster change and the calendar have to agree, so this delegates to
// addAthleteToGroup, which puts them on the roster, slots them into every
// future session the group already has, and materializes the group if this is
// the first athlete in it. Capacity is enforced there, not at request time —
// two families can both ask for the last spot and only one can get it.

import { NextRequest, NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { addAthleteToGroup } from '@/lib/groups'
import { notifyGroupJoinResolved } from '@/lib/notify'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can approve class requests.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const req = await db.groupJoinRequest.findUnique({ where: { id } })
  if (!req) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (req.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Already ${req.status}.` },
      { status: 409 }
    )
  }

  const result = await addAthleteToGroup(req.groupId, req.athleteId)
  if (!result.added) {
    // Left pending on purpose: a full class or an archived athlete is
    // something the owner may want to resolve and revisit, not a decision.
    return NextResponse.json(
      { success: false, error: result.reason ?? 'Could not add them.' },
      { status: 409 }
    )
  }

  await db.groupJoinRequest.update({
    where: { id },
    data: { status: 'approved', resolvedAt: new Date(), resolvedBy: session.userId },
  })

  after(() => notifyGroupJoinResolved(id, 'approved'))

  return NextResponse.json({
    success: true,
    data: {
      joinedSessions: result.joinedSessions,
      createdSessions: result.createdSessions,
    },
  })
}
