// Edit one staff account: name, email, role, coach status, enabled/disabled.
//
// The guards below all protect the same thing — the gym must never be left
// unable to sign in as an admin. Three separate edits can cause that (disable
// the last admin, demote the last admin, or do either to yourself by
// accident), so each is refused explicitly rather than relying on the person
// clicking carefully.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isDeliverableEmail } from '@/lib/notify'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { isOwner } from '@/lib/owner'

async function otherActiveAdmins(excludeUserId: string): Promise<number> {
  return db.user.count({
    where: { role: 'ADMIN', active: true, id: { not: excludeUserId } },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can edit staff.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const target = await db.user.findUnique({ where: { id }, include: { trainer: true } })
  if (!target) {
    return NextResponse.json({ success: false, error: 'Staff member not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  // Owners: only an owner can edit an owner (their email is their login, and
  // demoting or disabling them would take the money screens away), and only
  // an owner can grant or remove owner access.
  const actorIsOwner = await isOwner(session.userId)
  if (target.isOwner && target.id !== session.userId && !actorIsOwner) {
    return NextResponse.json(
      { success: false, error: 'Only an owner can change an owner’s account.' },
      { status: 403 }
    )
  }
  if (body.isPT !== undefined) data.isPT = Boolean(body.isPT)

  if (body.isOwner !== undefined) {
    if (!actorIsOwner) {
      return NextResponse.json({ success: false, error: 'Only an owner can grant owner access.' }, { status: 403 })
    }
    const next = Boolean(body.isOwner)
    if (!next && target.isOwner) {
      const others = await db.user.count({
        where: { isOwner: true, active: true, role: 'ADMIN', id: { not: target.id } },
      })
      if (others === 0) {
        return NextResponse.json({ success: false, error: 'This is the only owner.' }, { status: 400 })
      }
    }
    if (next && (body.role ?? target.role) !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'An owner must also be an admin.' }, { status: 400 })
    }
    data.isOwner = next
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name cannot be empty.' }, { status: 400 })
    }
    data.name = name
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase()
    if (!isDeliverableEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Use a real email address — it is where reminders go.' },
        { status: 400 }
      )
    }
    const clash = await db.user.findUnique({ where: { email }, select: { id: true, name: true } })
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { success: false, error: `${clash.name} already uses that address.` },
        { status: 409 }
      )
    }
    data.email = email
  }

  if (body.role !== undefined) {
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'TRAINER'
    if (role !== 'ADMIN' && target.role === 'ADMIN') {
      if (target.id === session.userId) {
        return NextResponse.json(
          { success: false, error: 'You cannot remove your own admin access — ask another admin.' },
          { status: 400 }
        )
      }
      if ((await otherActiveAdmins(target.id)) === 0) {
        return NextResponse.json(
          { success: false, error: 'This is the only active admin. Promote someone else first.' },
          { status: 400 }
        )
      }
    }
    data.role = role
    if (role !== 'ADMIN' && target.isOwner) data.isOwner = false
  }

  if (body.active !== undefined) {
    const active = Boolean(body.active)
    if (!active) {
      if (target.id === session.userId) {
        return NextResponse.json(
          { success: false, error: 'You cannot disable your own account.' },
          { status: 400 }
        )
      }
      if (target.role === 'ADMIN' && (await otherActiveAdmins(target.id)) === 0) {
        return NextResponse.json(
          { success: false, error: 'This is the only active admin — the gym would be locked out.' },
          { status: 400 }
        )
      }
    }
    data.active = active
  }

  // Coach status is a Trainer row, not a column. Creating one is safe;
  // removing one is NOT — sessions reference it (ON DELETE RESTRICT) — so
  // "no longer a coach" archives instead, which is what hides them from
  // pickers while their history stays intact.
  let coachNote: string | undefined
  if (body.isCoach !== undefined) {
    const wantsCoach = Boolean(body.isCoach)
    if (wantsCoach && !target.trainer) {
      await db.trainer.create({ data: { gymId: DEFAULT_GYM_ID, userId: target.id } })
      coachNote = 'Added as a coach; they now appear in coach pickers.'
    } else if (wantsCoach && target.trainer?.archived) {
      await db.trainer.update({ where: { id: target.trainer.id }, data: { archived: false } })
      coachNote = 'Restored as a coach.'
    } else if (!wantsCoach && target.trainer && !target.trainer.archived) {
      const future = await db.session.count({
        where: { trainerId: target.trainer.id, cancelled: false, scheduledAt: { gte: new Date() } },
      })
      if (future > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${target.name} still has ${future} upcoming session${future === 1 ? '' : 's'}. Move or cancel those first.`,
          },
          { status: 409 }
        )
      }
      await db.trainer.update({ where: { id: target.trainer.id }, data: { archived: true } })
      coachNote = 'No longer a coach; past sessions and athlete assignments are kept.'
    }
  }

  // Disabling someone should also take them off the floor, or they keep
  // appearing as a bookable coach nobody can reach.
  if (data.active === false && target.trainer && !target.trainer.archived) {
    const future = await db.session.count({
      where: { trainerId: target.trainer.id, cancelled: false, scheduledAt: { gte: new Date() } },
    })
    if (future > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${target.name} still has ${future} upcoming session${future === 1 ? '' : 's'}. Move or cancel those before disabling the account.`,
        },
        { status: 409 }
      )
    }
    await db.trainer.update({ where: { id: target.trainer.id }, data: { archived: true } })
  }

  if (Object.keys(data).length > 0) {
    await db.user.update({ where: { id }, data })
  }

  console.info(
    `[staff] ${session.email} updated ${target.email}: ${JSON.stringify({ ...data, isCoach: body.isCoach })}`
  )

  const updated = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true, isOwner: true, isPT: true, trainer: { select: { archived: true } } },
  })

  return NextResponse.json({
    success: true,
    data: { ...updated, isCoach: Boolean(updated?.trainer) && !updated!.trainer!.archived },
    ...(coachNote ? { note: coachNote } : {}),
  })
}
