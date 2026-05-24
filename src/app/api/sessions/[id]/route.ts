import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { validateBooking } from '@/lib/scheduling/engine'

// GET /api/sessions/[id] - Get a single session
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

    const dbSession = await db.session.findUnique({
      where: { id },
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
        checkIn: true,
      },
    })

    if (!dbSession) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Trainers can only see their own sessions
    if (session.role === 'TRAINER' && dbSession.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: dbSession,
    })
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// PATCH /api/sessions/[id] - Update a session
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

    // Find the session
    const existingSession = await db.session.findUnique({
      where: { id },
    })

    if (!existingSession) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Trainers can only update their own sessions
    if (session.role === 'TRAINER' && existingSession.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Trainers can also change the athlete, but only to one of their own.
    const nextAthleteId = body.athleteId ?? existingSession.athleteId
    if (
      session.role === 'TRAINER' &&
      body.athleteId &&
      body.athleteId !== existingSession.athleteId
    ) {
      const owned = await db.athlete.findFirst({
        where: { id: nextAthleteId, trainerId: session.trainerId },
      })
      if (!owned) {
        return NextResponse.json(
          { success: false, error: 'Athlete is not assigned to you.' },
          { status: 403 }
        )
      }
    }

    const nextTrainerId =
      session.role === 'ADMIN' ? (body.trainerId ?? existingSession.trainerId) : existingSession.trainerId
    const nextScheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : existingSession.scheduledAt
    const nextDuration =
      typeof body.duration === 'number' ? body.duration : existingSession.duration

    // Engine-validate the proposed new state. Pass the session id to
    // exclude it from "conflicts with itself" checks.
    const validation = await validateBooking(
      DEFAULT_GYM_ID,
      {
        trainerId: nextTrainerId,
        athleteId: nextAthleteId,
        scheduledAt: nextScheduledAt,
        duration: nextDuration,
      },
      id
    )
    if (!validation.ok) {
      return NextResponse.json({
        success: false,
        error: validation.conflicts[0]?.message ?? 'Conflict',
        conflicts: validation.conflicts,
      })
    }

    const updateData: Record<string, unknown> = {
      trainerId: nextTrainerId,
      athleteId: nextAthleteId,
      scheduledAt: nextScheduledAt,
      duration: nextDuration,
    }
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.cancelled !== undefined) updateData.cancelled = body.cancelled

    const updated = await db.session.update({
      where: { id },
      data: updateData,
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
    })
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// DELETE /api/sessions/[id] - Cancel a session
export async function DELETE(
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
    })

    if (!existingSession) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Trainers can only cancel their own sessions
    if (session.role === 'TRAINER' && existingSession.trainerId !== session.trainerId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Soft delete - mark as cancelled
    await db.session.update({
      where: { id },
      data: { cancelled: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Session cancelled',
    })
  } catch (error) {
    console.error('Error cancelling session:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
