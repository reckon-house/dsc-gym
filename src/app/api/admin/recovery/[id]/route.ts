// Remove a recovery-room visit.
//
// A hard delete, unlike most things here: this is a charge line, and a charge
// logged against the wrong athlete needs to leave no trace on their bill.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can remove a charge.' },
      { status: session ? 403 : 401 }
    )
  }
  const { id } = await params
  const visit = await db.recoveryVisit.findUnique({ where: { id } })
  if (!visit) {
    return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 })
  }
  await db.recoveryVisit.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
