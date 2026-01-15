import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/athletes/[id] - Get a single athlete
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const athlete = await db.athlete.findUnique({
      where: { id },
      include: {
        sessions: {
          where: { cancelled: false },
          orderBy: { scheduledAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            sessions: true,
            checkIns: true,
          },
        },
      },
    })

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: 'Athlete not found' },
        { status: 404 }
      )
    }

    // Trainers can only see their own athletes
    if (session.role === 'TRAINER' && athlete.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: athlete,
    })
  } catch (error) {
    console.error('Error fetching athlete:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// PATCH /api/athletes/[id] - Update an athlete
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Find the athlete
    const existingAthlete = await db.athlete.findUnique({
      where: { id },
    })

    if (!existingAthlete) {
      return NextResponse.json(
        { success: false, error: 'Athlete not found' },
        { status: 404 }
      )
    }

    // Trainers can only update their own athletes
    if (session.role === 'TRAINER' && existingAthlete.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (body.firstName) updateData.firstName = body.firstName
    if (body.lastName) updateData.lastName = body.lastName
    if (body.email) updateData.email = body.email

    const updated = await db.athlete.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    console.error('Error updating athlete:', error)
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
