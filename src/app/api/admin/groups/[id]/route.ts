// GET/PATCH/DELETE a single group.
//
// DELETE is a soft delete (active=false): sessions already materialized from
// the group stay on the calendar, because cancelling a month of training
// because someone tidied up a roster would be a nasty surprise.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const group = await db.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          athlete: { select: { id: true, firstName: true, lastName: true, archived: true } },
        },
      },
      coaches: {
        include: { trainer: { select: { id: true, user: { select: { name: true } } } } },
      },
    },
  })
  if (!group) {
    return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: group })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can edit groups.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const group = await db.group.findUnique({ where: { id } })
  if (!group) {
    return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.dayOfWeek !== undefined)
    data.dayOfWeek = body.dayOfWeek === null ? null : Number(body.dayOfWeek)
  if (body.startMinute !== undefined)
    data.startMinute = body.startMinute === null ? null : Number(body.startMinute)
  if (body.duration !== undefined) data.duration = Number(body.duration)
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null

  try {
    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.group.update({ where: { id }, data })
      }

      // Roster edits are expressed as add/remove lists rather than a full
      // replacement, so two admins editing at once can't silently wipe each
      // other's changes.
      if (Array.isArray(body.addMemberIds) && body.addMemberIds.length) {
        for (const athleteId of body.addMemberIds.map(String)) {
          await tx.groupMember.upsert({
            where: { groupId_athleteId: { groupId: id, athleteId } },
            create: { groupId: id, athleteId },
            update: {},
          })
        }
      }
      if (Array.isArray(body.removeMemberIds) && body.removeMemberIds.length) {
        await tx.groupMember.deleteMany({
          where: { groupId: id, athleteId: { in: body.removeMemberIds.map(String) } },
        })
      }
      if (Array.isArray(body.addCoachIds) && body.addCoachIds.length) {
        for (const trainerId of body.addCoachIds.map(String)) {
          await tx.groupCoach.upsert({
            where: { groupId_trainerId: { groupId: id, trainerId } },
            create: { groupId: id, trainerId, isLead: false },
            update: {},
          })
        }
      }
      if (Array.isArray(body.removeCoachIds) && body.removeCoachIds.length) {
        await tx.groupCoach.deleteMany({
          where: { groupId: id, trainerId: { in: body.removeCoachIds.map(String) } },
        })
      }

      // Exactly one lead at a time.
      if (body.setLeadCoachId) {
        const leadId = String(body.setLeadCoachId)
        await tx.groupCoach.updateMany({ where: { groupId: id }, data: { isLead: false } })
        await tx.groupCoach.updateMany({
          where: { groupId: id, trainerId: leadId },
          data: { isLead: true },
        })
      }
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A group with that name already exists.' },
        { status: 409 }
      )
    }
    console.error('Error updating group:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }

  const updated = await db.group.findUnique({
    where: { id },
    include: {
      members: { include: { athlete: { select: { id: true, firstName: true, lastName: true } } } },
      coaches: { include: { trainer: { select: { id: true, user: { select: { name: true } } } } } },
    },
  })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can delete groups.' },
      { status: session ? 403 : 401 }
    )
  }
  const { id } = await params
  // Soft delete — already-materialized sessions are left alone on purpose.
  await db.group.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
