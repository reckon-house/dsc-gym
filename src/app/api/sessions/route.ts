import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { validateBooking } from '@/lib/scheduling/engine'

// GET /api/sessions - List sessions
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') // YYYY-MM-DD
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const trainerId = searchParams.get('trainerId')
    const athleteId = searchParams.get('athleteId')
    const includeCancelled = searchParams.get('includeCancelled') === 'true'

    // Build where clause
    const where: Record<string, unknown> = {}

    // Trainer filter - trainers can only see their own sessions
    if (session.role === 'TRAINER') {
      where.trainerId = session.trainerId
    } else if (trainerId) {
      where.trainerId = trainerId
    }

    if (athleteId) {
      where.athleteId = athleteId
    }

    // Date filters
    if (date) {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      where.scheduledAt = {
        gte: dayStart,
        lte: dayEnd,
      }
    } else if (startDate || endDate) {
      where.scheduledAt = {}
      if (startDate) {
        (where.scheduledAt as Record<string, unknown>).gte = new Date(startDate)
      }
      if (endDate) {
        (where.scheduledAt as Record<string, unknown>).lte = new Date(endDate)
      }
    }

    if (!includeCancelled) {
      where.cancelled = false
    }

    const sessions = await db.session.findMany({
      where,
      include: {
        athlete: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        trainer: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        attendees: {
          include: {
            athlete: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    // Flatten the attendees into a simpler array for the client.
    const data = sessions.map((s) => ({
      ...s,
      attendees: s.attendees.map((a) => ({
        id: a.athleteId,
        firstName: a.athlete.firstName,
        lastName: a.athlete.lastName,
      })),
    }))

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// POST /api/sessions - Create a session
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { athleteId, scheduledAt, duration = 60, notes, trainerId: bodyTrainerId } = body

    // Determine trainer ID
    let trainerId = session.trainerId
    if (session.role === 'ADMIN' && bodyTrainerId) {
      trainerId = bodyTrainerId
    }

    if (!trainerId) {
      return NextResponse.json(
        { success: false, error: 'No trainer context' },
        { status: 400 }
      )
    }

    if (!athleteId || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: 'athleteId and scheduledAt are required' },
        { status: 400 }
      )
    }

    // For trainers: athlete must be one of THEIRS. Admins can book anyone.
    if (session.role !== 'ADMIN') {
      const athlete = await db.athlete.findFirst({
        where: { id: athleteId, trainerId },
      })
      if (!athlete) {
        return NextResponse.json(
          { success: false, error: 'Athlete not found or not assigned to you.' },
          { status: 404 }
        )
      }
    }

    // ALL session creates go through the engine — same rules whether
    // it's admin via chat, admin via tap-to-edit, or trainer via the
    // trainer dashboard. No more parallel paths that bypass validation.
    const validation = await validateBooking(DEFAULT_GYM_ID, {
      trainerId,
      athleteId,
      scheduledAt: new Date(scheduledAt),
      duration,
    })
    if (!validation.ok) {
      return NextResponse.json({
        success: false,
        error: validation.conflicts[0]?.message ?? 'Conflict',
        conflicts: validation.conflicts,
      })
    }

    const newSession = await db.session.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        trainerId,
        athleteId,
        scheduledAt: new Date(scheduledAt),
        duration,
        notes,
        attendees: { create: [{ athleteId }] },
      },
      include: {
        athlete: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: newSession,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
