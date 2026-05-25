// Public read-only gym overview: mission, services, hours, locations,
// contact + active trainers with bios. Used by the athlete dashboard
// (and anyone signed in or not — gym profile is public info).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { publicBaseUrl } from '@/lib/oauth/util'

export async function GET(request: NextRequest) {
  const [gym, trainers] = await Promise.all([
    db.gym.findUnique({ where: { id: DEFAULT_GYM_ID } }),
    db.trainer.findMany({
      where: { gymId: DEFAULT_GYM_ID, archived: false },
      include: { user: { select: { name: true } } },
      orderBy: [{ user: { name: 'asc' } }],
    }),
  ])
  if (!gym) {
    return NextResponse.json({ success: false, error: 'Gym not found' }, { status: 404 })
  }
  // The MCP URL needs to be the publicly-reachable one even when this
  // endpoint is hit from localhost during dev. publicBaseUrl() respects
  // the same env override chain we use for email links, so a dev with
  // NEXT_PUBLIC_BASE_URL pointed at prod gets a real, copyable URL.
  const base = publicBaseUrl(request.nextUrl.origin)
  return NextResponse.json({
    success: true,
    data: {
      gym: {
        name: gym.name,
        tagline: gym.tagline,
        mission: gym.mission,
        about: gym.about,
        hours: gym.hoursJson,
        locations: gym.locationsJson,
        contact: gym.contactJson,
        services: gym.servicesJson,
        facilities: gym.facilitiesText,
        mcpUrl: `${base}/api/mcp/athlete`,
      },
      trainers: trainers.map((t) => ({
        id: t.id,
        name: t.user.name,
        title: t.title,
        bio: t.bio,
        specialties: t.specialties,
        certifications: t.certifications,
        education: t.education,
      })),
    },
  })
}
