// Change your own password.
//
// Open to any signed-in staff member, admin or trainer — everyone has a
// password and everyone should be able to rotate it without asking someone
// with database access.
//
// The current password is required even though the session already proves who
// you are: it means an unattended logged-in browser can't be used to lock the
// real owner out of their own account.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession,
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
} from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, error: 'Enter your current password and a new one.' },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user) {
    return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 })
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json(
      { success: false, error: 'That is not your current password.' },
      { status: 403 }
    )
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { success: false, error: 'That is the password you already have.' },
      { status: 400 }
    )
  }

  const strength = checkPasswordStrength(newPassword)
  if (!strength.ok) {
    return NextResponse.json({ success: false, error: strength.error }, { status: 400 })
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  // The session cookie is a signed JWT that never contained the password, so
  // it stays valid — changing your password does not sign you out here. Other
  // devices stay signed in too, which is worth saying out loud in the UI.
  return NextResponse.json({ success: true })
}
