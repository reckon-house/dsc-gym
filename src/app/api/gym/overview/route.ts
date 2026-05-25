// Public read-only gym overview: mission, services, hours, locations,
// contact + active trainers with bios. Used by the athlete dashboard
// (and anyone signed in or not — gym profile is public info).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
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
