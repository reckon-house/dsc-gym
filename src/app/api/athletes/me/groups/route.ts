// Classes a family can see and ask to join.
//
// Under /api/athletes/me on purpose: that prefix is already public in
// middleware and every route beneath it authenticates itself with the
// athleteSession cookie.

import { NextResponse } from 'next/server'
import { readAthleteSession } from '@/lib/athleteAuth'
import { listOpenGroups } from '@/lib/groups'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
  const session = await readAthleteSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const groups = await listOpenGroups(DEFAULT_GYM_ID, session.athleteIds)
  return NextResponse.json({ success: true, data: groups })
}
