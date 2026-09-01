// An admin sets someone else's password.
//
// This is the "Justin forgot his login" path. It exists because the only
// alternative today is a direct database write, which is worse.
//
// Unlike the self-service route it cannot ask for the current password —
// nobody knows it. That makes it a genuine privilege: an admin can take over
// any staff account. Two guards keep it honest:
//   - it refuses to touch your own account, so the "prove you know the current
//     one" rule can't be sidestepped by resetting yourself;
//   - it is admin-only and logs who did it to whom.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, hashPassword, checkPasswordStrength } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can reset a password.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  if (id === session.userId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Use the account page to change your own password — it asks for your current one.',
      },
      { status: 400 }
    )
  }

  const target = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } })
  if (!target) {
    return NextResponse.json({ success: false, error: 'Staff member not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const newPassword = String(body.newPassword ?? '')

  const strength = checkPasswordStrength(newPassword)
  if (!strength.ok) {
    return NextResponse.json({ success: false, error: strength.error }, { status: 400 })
  }

  await db.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  // There is no audit table, so this is the record. Never log the password.
  console.info(
    `[auth] password reset by admin ${session.email} for ${target.email}`
  )

  return NextResponse.json({
    success: true,
    data: { name: target.name, email: target.email },
  })
}
