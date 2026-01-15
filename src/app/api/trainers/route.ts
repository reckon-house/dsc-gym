import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/trainers - List all trainers (admin only)
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Only admins can list all trainers
    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const today = new Date()
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(today)
    dayEnd.setHours(23, 59, 59, 999)

    const trainers = await db.trainer.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        _count: {
          select: {
            athletes: true,
            sessions: true,
          },
        },
        sessions: {
          where: {
            scheduledAt: {
              gte: dayStart,
              lte: dayEnd,
            },
            cancelled: false,
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
          orderBy: {
            scheduledAt: 'asc',
          },
        },
      },
    })

    // Add stats for each trainer
    const trainersWithStats = trainers.map((trainer) => {
      const todaySessions = trainer.sessions
      const completedToday = todaySessions.filter((s) => s.completed).length
      const totalToday = todaySessions.length

      return {
        id: trainer.id,
        user: trainer.user,
        totalAthletes: trainer._count.athletes,
        totalSessions: trainer._count.sessions,
        todaySessions: todaySessions,
        todayStats: {
          total: totalToday,
          completed: completedToday,
          remaining: totalToday - completedToday,
        },
      }
    })

    return NextResponse.json({
      success: true,
      data: trainersWithStats,
    })
  } catch (error) {
    console.error('Error fetching trainers:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
