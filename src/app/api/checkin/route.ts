import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/checkin - Process athlete check-in
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name } = body

    if (!email && !name) {
      return NextResponse.json(
        { success: false, error: 'Email or name is required' },
        { status: 400 }
      )
    }

    // Find athlete by email or name
    let athlete = null

    if (email) {
      athlete = await db.athlete.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          trainer: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      })
    } else if (name) {
      // Parse first and last name from input
      const nameParts = name.trim().split(/\s+/)
      const firstName = nameParts[0]
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

      // SQLite doesn't support case-insensitive mode, so we fetch all and filter
      const athletes = await db.athlete.findMany({
        include: {
          trainer: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      })

      // Try exact match first (case-insensitive)
      athlete = athletes.find(
        (a) =>
          a.firstName.toLowerCase() === firstName.toLowerCase() &&
          a.lastName.toLowerCase() === lastName.toLowerCase()
      ) || null

      // If no exact match, try partial match
      if (!athlete) {
        athlete = athletes.find(
          (a) =>
            a.firstName.toLowerCase().includes(firstName.toLowerCase()) &&
            (lastName === '' || a.lastName.toLowerCase().includes(lastName.toLowerCase()))
        ) || null
      }

      // If still no match, try first name only
      if (!athlete) {
        athlete = athletes.find(
          (a) => a.firstName.toLowerCase() === firstName.toLowerCase()
        ) || null
      }
    }

    if (!athlete) {
      return NextResponse.json(
        {
          success: false,
          error: 'No athlete found. Please check your name or register first.',
          matched: false,
        },
        { status: 404 }
      )
    }

    // Find today's session for this athlete
    const today = new Date()
    const dayStart = new Date(today)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(today)
    dayEnd.setHours(23, 59, 59, 999)

    const todaySession = await db.session.findFirst({
      where: {
        athleteId: athlete.id,
        scheduledAt: {
          gte: dayStart,
          lte: dayEnd,
        },
        cancelled: false,
        completed: false,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    // Create check-in record
    const checkIn = await db.checkIn.create({
      data: {
        athleteId: athlete.id,
        sessionId: todaySession?.id || null,
        matched: !!todaySession,
      },
    })

    // If session found, mark it as completed
    if (todaySession) {
      await db.session.update({
        where: { id: todaySession.id },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      })
    }

    // Get next upcoming session if no session today
    let nextSession = null
    if (!todaySession) {
      nextSession = await db.session.findFirst({
        where: {
          athleteId: athlete.id,
          scheduledAt: {
            gt: dayEnd,
          },
          cancelled: false,
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      })
    }

    return NextResponse.json({
      success: true,
      athleteName: `${athlete.firstName} ${athlete.lastName}`,
      data: {
        athlete: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
        },
        trainer: athlete.trainer ? {
          name: athlete.trainer.user.name,
        } : null,
        session: todaySession
          ? {
              id: todaySession.id,
              scheduledAt: todaySession.scheduledAt,
              duration: todaySession.duration,
            }
          : null,
        nextSession: nextSession
          ? {
              scheduledAt: nextSession.scheduledAt,
            }
          : null,
        checkIn: {
          id: checkIn.id,
          time: checkIn.checkInTime,
        },
        matched: !!todaySession,
      },
      matched: !!todaySession,
      message: todaySession
        ? `Welcome back, ${athlete.firstName}! Your session has been checked in.`
        : `Welcome, ${athlete.firstName}! No session scheduled for today.`,
    })
  } catch (error) {
    console.error('Check-in error:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred during check-in' },
      { status: 500 }
    )
  }
}
