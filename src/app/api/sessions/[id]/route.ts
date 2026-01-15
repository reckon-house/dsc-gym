import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

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

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt)
    if (body.duration) updateData.duration = body.duration
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
