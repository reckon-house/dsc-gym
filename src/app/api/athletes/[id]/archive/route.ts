// POST /api/athletes/[id]/archive - archive (soft-remove) an athlete.
//
// This is the normal way to take someone off the roster: they stop appearing
// in lists, can't log in, and their future sessions are cleared — but every
// record survives and `restore` puts them back. The destructive counterpart is
// DELETE /api/athletes/[id].

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { archiveAthlete } from '@/lib/athletes'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only an admin can archive an athlete.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const athlete = await db.athlete.findUnique({ where: { id } })
    if (!athlete) {
      return NextResponse.json({ success: false, error: 'Athlete not found' }, { status: 404 })
    }

    const result = await archiveAthlete(athlete.gymId, id, {
      cancelFutureSessions: body.cancelFutureSessions !== false,
    })
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Error archiving athlete:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}
