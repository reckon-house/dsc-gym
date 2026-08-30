// POST /api/athletes/[id]/restore - un-archive an athlete.
//
// Puts them back on the roster and re-enables login. Sessions cancelled during
// archiving are NOT resurrected — rebooking is a deliberate act, not a side
// effect of restoring a profile.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { unarchiveAthlete } from '@/lib/athletes'

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
        { success: false, error: 'Only an admin can restore an athlete.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const athlete = await db.athlete.findUnique({ where: { id } })
    if (!athlete) {
      return NextResponse.json({ success: false, error: 'Athlete not found' }, { status: 404 })
    }

    const result = await unarchiveAthlete(athlete.gymId, id)
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Error restoring athlete:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}
