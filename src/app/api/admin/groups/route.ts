// Groups: named, recurring cohorts ("the basketball group, Mondays at 11am").
//
// GET  /api/admin/groups            list with rosters
// POST /api/admin/groups            create

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const groups = await db.group.findMany({
    where: { gymId: DEFAULT_GYM_ID, ...(includeInactive ? {} : { active: true }) },
    include: {
      members: {
        include: {
          athlete: { select: { id: true, firstName: true, lastName: true, archived: true } },
        },
      },
      coaches: {
        include: { trainer: { select: { id: true, user: { select: { name: true } } } } },
      },
      _count: { select: { sessions: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ success: true, data: groups })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can create groups.' },
      { status: session ? 403 : 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ success: false, error: 'Name is required.' }, { status: 400 })
  }

  // dayOfWeek/startMinute are optional: a group can exist purely as a roster
  // (useful for announcements) before it has a standing time.
  const dayOfWeek =
    body.dayOfWeek === null || body.dayOfWeek === undefined ? null : Number(body.dayOfWeek)
  const startMinute =
    body.startMinute === null || body.startMinute === undefined
      ? null
      : Number(body.startMinute)
  if (dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json({ success: false, error: 'dayOfWeek must be 0-6.' }, { status: 400 })
  }
  if (startMinute !== null && (startMinute < 0 || startMinute > 1439)) {
    return NextResponse.json(
      { success: false, error: 'startMinute must be 0-1439.' },
      { status: 400 }
    )
  }

  const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : []
  const coachIds: string[] = Array.isArray(body.coachIds) ? body.coachIds.map(String) : []

  try {
    const group = await db.group.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        name,
        dayOfWeek,
        startMinute,
        duration: body.duration ? Number(body.duration) : 60,
        notes: body.notes ? String(body.notes) : null,
        openForSignup: Boolean(body.openForSignup),
        capacity:
          body.capacity === null || body.capacity === undefined || body.capacity === ''
            ? null
            : Number(body.capacity),
        description: body.description ? String(body.description) : null,
        members: { create: memberIds.map((athleteId) => ({ athleteId })) },
        // First coach listed is the lead — they become Session.trainerId.
        coaches: {
          create: coachIds.map((trainerId, i) => ({ trainerId, isLead: i === 0 })),
        },
      },
      include: { members: true, coaches: true },
    })
    return NextResponse.json({ success: true, data: group }, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: `A group named "${name}" already exists.` },
        { status: 409 }
      )
    }
    console.error('Error creating group:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}
