// The gyms a session or group can be tagged with. Public, like the rest of
// /api/gym — it is the same list the About section shows.

import { NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { gymLocations } from '@/lib/locations'

export async function GET() {
  return NextResponse.json({ success: true, data: await gymLocations(DEFAULT_GYM_ID) })
}
