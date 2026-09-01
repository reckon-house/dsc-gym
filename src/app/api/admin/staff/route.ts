// Everyone with a staff login.
//
// Distinct from /api/trainers, which lists people who can be BOOKED and hangs
// rosters and availability off them. This is the account list — it includes an
// admin who has no trainer record, and it never returns a password hash.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ success: true, data: users })
}
