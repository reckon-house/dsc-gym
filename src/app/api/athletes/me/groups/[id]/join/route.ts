// Ask for a spot in an open group, or take the request back.
//
// Asking never changes the roster — it files a GroupJoinRequest for the owner
// to act on. Capacity is reported here so the form can grey out a full class,
// but it is ENFORCED at approval (see addAthleteToGroup): two families can both
// ask for the last spot, and the second one approved is the one refused.

import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { readAthleteSession } from '@/lib/athleteAuth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { notifyGroupJoinRequested } from '@/lib/notify'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await readAthleteSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id: groupId } = await params
  const body = await request.json().catch(() => ({}))

  // Which kid the spot is for. Defaults to the active one, but must be someone
  // on this login — otherwise a parent could enroll a stranger's child.
  const athleteId = body.athleteId ? String(body.athleteId) : session.activeId
  if (!session.athleteIds.includes(athleteId)) {
    return NextResponse.json(
      { success: false, error: 'That athlete is not on this account.' },
      { status: 403 }
    )
  }

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { athlete: { select: { archived: true } } } } },
  })
  if (!group || group.gymId !== DEFAULT_GYM_ID || !group.active || !group.openForSignup) {
    return NextResponse.json(
      { success: false, error: 'That class is not open for signups.' },
      { status: 404 }
    )
  }

  const active = group.members.filter((m) => !m.athlete.archived)
  if (active.some((m) => m.athleteId === athleteId)) {
    return NextResponse.json(
      { success: false, error: 'Already in this class.' },
      { status: 409 }
    )
  }
  if (group.capacity !== null && active.length >= group.capacity) {
    return NextResponse.json(
      { success: false, error: `${group.name} is full right now.` },
      { status: 409 }
    )
  }

  try {
    const req = await db.groupJoinRequest.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        groupId,
        athleteId,
        note: body.note ? String(body.note).slice(0, 500) : null,
        status: 'pending',
      },
    })
    after(() => notifyGroupJoinRequested(req.id))
    return NextResponse.json({ success: true, data: { id: req.id } }, { status: 201 })
  } catch (error) {
    // The partial unique index means a second ask while one is still pending.
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'You have already asked for a spot in this class.' },
        { status: 409 }
      )
    }
    console.error('Error creating group join request:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await readAthleteSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { id: groupId } = await params

  const cancelled = await db.groupJoinRequest.updateMany({
    where: {
      groupId,
      athleteId: { in: session.athleteIds },
      status: 'pending',
    },
    data: { status: 'cancelled', resolvedAt: new Date() },
  })
  if (cancelled.count === 0) {
    return NextResponse.json(
      { success: false, error: 'No pending request to cancel.' },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true })
}
