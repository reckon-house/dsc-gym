import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/sessions/[id]/complete - Mark a session as completed
export async function POST(
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

    // Find the session
    const existingSession = await db.session.findUnique({
      where: { id },
      include: {
        athlete: true,
      },
    })

    if (!existingSession) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Trainers can only complete their own sessions
    if (session.role === 'TRAINER' && existingSession.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (existingSession.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Cannot complete a cancelled session' },
        { status: 400 }
      )
    }

    if (existingSession.completed) {
      return NextResponse.json(
        { success: false, error: 'Session already completed' },
        { status: 400 }
      )
    }

    // Mark as completed
    const updated = await db.session.update({
      where: { id },
      data: {
        completed: true,
        completedAt: new Date(),
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

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Session with ${existingSession.athlete.firstName} ${existingSession.athlete.lastName} marked as completed`,
    })
  } catch (error) {
    console.error('Error completing session:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
