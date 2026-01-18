import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/walkins/[id]/assign - Assign walk-in to trainer and convert to athlete
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

    // Find the walk-in
    const walkIn = await db.walkIn.findUnique({
      where: { id },
    })

    if (!walkIn) {
      return NextResponse.json(
        { success: false, error: 'Walk-in not found' },
        { status: 404 }
      )
    }

    if (walkIn.claimed) {
      return NextResponse.json(
        { success: false, error: 'Walk-in has already been claimed' },
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

    // Parse name into first/last
    const nameParts = walkIn.name.trim().split(/\s+/)
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || 'Unknown'

    // Create athlete from walk-in
    const athlete = await db.athlete.create({
      data: {
        firstName,
        lastName,
        email: walkIn.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@placeholder.com`,
        trainerId,
      },
    })

    // Update walk-in as claimed
    await db.walkIn.update({
      where: { id },
      data: {
        claimed: true,
        claimedBy: trainerId,
        claimedAt: new Date(),
        convertedToAthleteId: athlete.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: `${firstName} ${lastName} has been assigned to ${trainer.user.name}`,
      data: {
        athlete: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
        },
        trainer: {
          id: trainer.id,
          name: trainer.user.name,
        },
      },
    })
  } catch (error) {
    console.error('Error assigning walk-in:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to assign walk-in' },
      { status: 500 }
    )
  }
}
