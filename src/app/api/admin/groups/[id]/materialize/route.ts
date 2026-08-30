// POST /api/admin/groups/[id]/materialize
//
// Turns the group's weekly rule into real Sessions for the next N weeks.
// Idempotent: re-running skips weeks already on the calendar rather than
// double-booking them.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { materializeGroup } from '@/lib/scheduling/engine'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can materialize a group.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const weeks = Math.min(Math.max(Number(body.weeks ?? 8), 1), 26)

  const result = await materializeGroup(id, weeks)
  return NextResponse.json({ success: true, data: result })
}
