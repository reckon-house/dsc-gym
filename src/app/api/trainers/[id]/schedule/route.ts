import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/trainers/[id]/schedule - Get trainer's schedule
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
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') // YYYY-MM-DD
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Trainers can only see their own schedule
    if (session.role === 'TRAINER' && session.trainerId !== id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Verify trainer exists
    const trainer = await db.trainer.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!trainer) {
      return NextResponse.json(
        { success: false, error: 'Trainer not found' },
        { status: 404 }
      )
    }

    // Build date filter
    let dateFilter: Record<string, Date> = {}
    if (date) {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      dateFilter = {
        gte: dayStart,
        lte: dayEnd,
      }
    } else if (startDate || endDate) {
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
    } else {
      // Default to today
      const today = new Date()
      const dayStart = new Date(today)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(today)
      dayEnd.setHours(23, 59, 59, 999)
      dateFilter = {
        gte: dayStart,
        lte: dayEnd,
      }
    }

    const sessions = await db.session.findMany({
      where: {
        trainerId: id,
        scheduledAt: dateFilter,
        cancelled: false,
      },
      include: {
        athlete: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        checkIn: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    // Calculate stats
    const completed = sessions.filter((s) => s.completed).length
    const total = sessions.length

    return NextResponse.json({
      success: true,
      data: {
        trainer: {
          id: trainer.id,
          name: trainer.user.name,
        },
        sessions,
        stats: {
          total,
          completed,
          remaining: total - completed,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching trainer schedule:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
