// POST /api/athletes/[id]/waiver-link — make a waiver signing link for an
// athlete staff created, and email it unless { send: false }.
//
// The link is always returned too, so staff can text it when the profile has
// no real email (chat-created athletes get a placeholder address).

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { createWaiverLink } from '@/lib/waiverLink'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    if (session.role === 'TRAINER') {
      const a = await db.athlete.findUnique({ where: { id }, select: { trainerId: true } })
      if (!a || a.trainerId !== session.trainerId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
    } else if (session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const result = await createWaiverLink(id, {
      send: body.send !== false,
      origin: request.nextUrl.origin,
    })
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Error creating waiver link:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}
