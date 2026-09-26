// Any signed-in staff member (admin or coach).

import { NextResponse } from 'next/server'
import { getSession, type SessionUser } from '@/lib/auth'

export async function requireStaff(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSession()
  if (!user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  return { user }
}
