import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/athletes/[id]/assign - Assign an unassigned athlete to a trainer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin only' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { trainerId } = body

    if (!trainerId) {
      return NextResponse.json(
        { success: false, error: 'Trainer ID is required' },
        { status: 400 }
      )
    }

    // Find the athlete
    const athlete = await db.athlete.findUnique({
      where: { id },
    })

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: 'Athlete not found' },
        { status: 404 }
      )
    }

    if (athlete.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Athlete is already assigned to a trainer' },
        { status: 400 }
      )
    }

    // Verify trainer exists
    const trainer = await db.trainer.findUnique({
      where: { id: trainerId },
      include: { user: { select: { name: true } } },
    })

    if (!trainer) {
      return NextResponse.json(
        { success: false, error: 'Trainer not found' },
        { status: 404 }
      )
    }

    // Assign trainer to athlete
    const updatedAthlete = await db.athlete.update({
      where: { id },
      data: { trainerId },
    })

    return NextResponse.json({
      success: true,
      message: `${updatedAthlete.firstName} ${updatedAthlete.lastName} has been assigned to ${trainer.user.name}`,
      data: {
        athlete: {
          id: updatedAthlete.id,
          firstName: updatedAthlete.firstName,
          lastName: updatedAthlete.lastName,
        },
        trainer: {
          id: trainer.id,
          name: trainer.user.name,
        },
      },
    })
  } catch (error) {
    console.error('Error assigning athlete:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to assign athlete' },
      { status: 500 }
    )
  }
}
