// Which athlete a family's health-note request is about. Route files can only
// export handlers, so this lives here and both /api/athletes/me/health routes
// share it.

import type { NextRequest } from 'next/server'
import { readAthleteSession } from '@/lib/athleteAuth'
import { db } from '@/lib/db'

/** ?athleteId= picks a sibling on the same login; anything else is refused. */
export async function familyTarget(request: NextRequest) {
  const session = await readAthleteSession()
  if (!session) return null
  const asked = request.nextUrl.searchParams.get('athleteId')
  const athleteId = asked && session.athleteIds.includes(asked) ? asked : session.activeId
  if (asked && asked !== athleteId) return null
  const a = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { firstName: true, parentName: true },
  })
  return { athleteId, authorName: a?.parentName || (a ? `${a.firstName}'s family` : 'Family') }
}

