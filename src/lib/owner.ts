// Owner access: money is visible to the gym's owners only (Jordan and Scott),
// not to every admin — front desk is an admin too.
//
// Checked against the database on every request rather than baked into the
// session cookie, so revoking it takes effect immediately, not in 7 days.

import { NextResponse } from 'next/server'
import { getSession, type SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function isOwner(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false
  const u = await db.user.findUnique({ where: { id: userId }, select: { isOwner: true, role: true, active: true } })
  return Boolean(u?.isOwner && u.role === 'ADMIN' && u.active)
}

export async function requireOwner(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSession()
  if (!user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isOwner(user.userId))) {
    return { error: NextResponse.json({ success: false, error: 'Owners only.' }, { status: 403 }) }
  }
  return { user }
}
