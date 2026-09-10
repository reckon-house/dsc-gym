// Staff accounts: who can sign in, and as what.
//
// Distinct from /api/trainers, which lists people who can be BOOKED and hangs
// availability and rosters off them. Someone can be one without the other:
// the front desk is an admin who is never a coach, and a coach is a trainer
// who may not be an admin. Password hashes are never returned.

import { NextRequest, NextResponse } from 'next/server'
import { getSession, hashPassword, generateTempPassword, checkPasswordStrength } from '@/lib/auth'
import { db } from '@/lib/db'
import { isDeliverableEmail } from '@/lib/notify'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      trainer: {
        select: {
          id: true,
          archived: true,
          _count: { select: { athletes: true, sessions: true } },
        },
      },
    },
    orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({
    success: true,
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      isCoach: Boolean(u.trainer) && !u.trainer!.archived,
      hasTrainerRecord: Boolean(u.trainer),
      athletes: u.trainer?._count.athletes ?? 0,
      sessions: u.trainer?._count.sessions ?? 0,
      // Surfaced so the gym can see at a glance who the app cannot reach —
      // an unreachable coach silently gets no reminders and no digest.
      reachable: isDeliverableEmail(u.email),
      isSelf: u.id === session.userId,
    })),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can add staff.' },
      { status: session ? 403 : 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = body.role === 'ADMIN' ? 'ADMIN' : 'TRAINER'
  const isCoach = Boolean(body.isCoach)

  if (!name || !email) {
    return NextResponse.json(
      { success: false, error: 'Name and email are both required.' },
      { status: 400 }
    )
  }
  // A fake address is how six trainers ended up receiving nothing. Refuse it
  // at the point of creation rather than discovering it in a cron log.
  if (!isDeliverableEmail(email)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Use a real email address — it is where reminders and the morning digest go. A personal address is fine.',
      },
      { status: 400 }
    )
  }
  const clash = await db.user.findUnique({ where: { email }, select: { name: true } })
  if (clash) {
    return NextResponse.json(
      { success: false, error: `${clash.name} already uses that address.` },
      { status: 409 }
    )
  }

  // Caller may supply one; otherwise the app generates it. Never a shared
  // literal — that is how every trainer ended up on the same password.
  const password = body.password ? String(body.password) : generateTempPassword()
  const strength = checkPasswordStrength(password)
  if (!strength.ok) {
    return NextResponse.json({ success: false, error: strength.error }, { status: 400 })
  }

  const created = await db.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await hashPassword(password),
      // Only make a Trainer record when they will actually be booked. Without
      // this, front-desk staff appear in every "which coach?" dropdown.
      ...(isCoach ? { trainer: { create: { gymId: DEFAULT_GYM_ID } } } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
  })

  console.info(`[staff] ${session.email} created ${created.email} (${role}${isCoach ? ', coach' : ''})`)

  return NextResponse.json(
    {
      success: true,
      // Shown once so it can be handed over; never stored in readable form.
      data: { ...created, tempPassword: password, isCoach },
    },
    { status: 201 }
  )
}
