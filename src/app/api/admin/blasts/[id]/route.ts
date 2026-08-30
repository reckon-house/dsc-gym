// DELETE /api/admin/blasts/[id] — discard a draft that was never sent.
//
// Only drafts can be discarded. A blast that is sending or sent stays in the
// history permanently: it went to real inboxes, and the record of that is the
// point.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }
  const { id } = await params
  const updated = await db.blast.updateMany({
    where: { id, gymId: DEFAULT_GYM_ID, status: 'draft' },
    data: { status: 'discarded' },
  })
  if (updated.count !== 1) {
    return NextResponse.json(
      { success: false, error: 'That announcement is not a draft any more.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ success: true })
}
