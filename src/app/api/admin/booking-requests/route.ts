// List pending booking requests for the admin home.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export async function GET() {
  // Middleware only role-checks paths under /admin, and this lives under
  // /api/admin — so without this, any signed-in trainer could approve or
  // decline bookings for the whole gym. Every other /api/admin route checks
  // itself; these three were the exception.
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can act on booking requests.' },
      { status: session ? 403 : 401 }
    )
  }
  const rows = await db.bookingRequest.findMany({
    where: { gymId: DEFAULT_GYM_ID, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: {
      athlete: { select: { firstName: true, lastName: true, email: true } },
      trainer: { include: { user: { select: { name: true } } } },
    },
  })
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      athleteName: `${r.athlete.firstName} ${r.athlete.lastName}`,
      athleteEmail: r.athlete.email,
      trainerName: r.trainer.user.name,
      scheduledAt: r.scheduledAt.toISOString(),
      duration: r.duration,
      notes: r.notes,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
