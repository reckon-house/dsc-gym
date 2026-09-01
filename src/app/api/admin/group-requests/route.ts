// Pending "can my kid join this class?" requests, for the admin home.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.groupJoinRequest.findMany({
    where: { gymId: DEFAULT_GYM_ID, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: {
      athlete: { select: { firstName: true, lastName: true, email: true } },
      group: {
        select: {
          name: true,
          dayOfWeek: true,
          startMinute: true,
          capacity: true,
          members: { select: { athlete: { select: { archived: true } } } },
        },
      },
    },
  })

  return NextResponse.json({
    success: true,
    data: rows.map((r) => {
      const enrolled = r.group.members.filter((m) => !m.athlete.archived).length
      return {
        id: r.id,
        athleteName: `${r.athlete.firstName} ${r.athlete.lastName}`,
        athleteEmail: r.athlete.email,
        groupName: r.group.name,
        dayOfWeek: r.group.dayOfWeek,
        startMinute: r.group.startMinute,
        enrolled,
        capacity: r.group.capacity,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      }
    }),
  })
}
