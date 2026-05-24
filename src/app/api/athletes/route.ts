import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

// GET /api/athletes - List athletes
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
    const trainerId = searchParams.get('trainerId')

    // Build where clause
    const where: Record<string, unknown> = {}

    // Support unassigned filter (admin only). Only show athletes who
    // actually finished registration (emailVerified=true). Unverified
    // ones are abandoned signups, not real members.
    const unassigned = searchParams.get('unassigned')
    if (unassigned === 'true' && session.role === 'ADMIN') {
      where.trainerId = null
      where.emailVerified = true
      where.archived = false
    } else if (session.role === 'TRAINER') {
      // Trainers can only see their own athletes
      where.trainerId = session.trainerId
    } else if (trainerId) {
      where.trainerId = trainerId
    }

    const athletes = await db.athlete.findMany({
      where,
      include: {
        _count: {
          select: {
            sessions: true,
          },
        },
        trainer: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: {
        lastName: 'asc',
      },
    })

    return NextResponse.json({
      success: true,
      data: athletes,
    })
  } catch (error) {
    console.error('Error fetching athletes:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// POST /api/athletes - Create an athlete
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
    const { firstName, lastName, email, trainerId: bodyTrainerId } = body

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

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'firstName and lastName are required' },
        { status: 400 }
      )
    }

    // Generate email if not provided
    const athleteEmail =
      email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@placeholder.com`

    const athlete = await db.athlete.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        firstName,
        lastName,
        email: athleteEmail,
        trainerId,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: athlete,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating athlete:', error)
    // Check for unique constraint violation
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'An athlete with this email already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
