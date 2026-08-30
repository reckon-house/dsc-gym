// POST /api/admin/blasts/[id]/send — the confirm step.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendBlast } from '@/lib/blast'
import { publicBaseUrl } from '@/lib/oauth/util'

export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can send announcements.' },
      { status: session ? 403 : 401 }
    )
  }
  const { id } = await params
  const result = await sendBlast(id, publicBaseUrl(new URL(request.url).origin))
  if ('error' in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ success: true, data: result })
}
