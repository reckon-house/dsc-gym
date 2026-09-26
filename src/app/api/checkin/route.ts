import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { staffCheckIn } from '@/lib/checkin'

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
      athlete = await db.athlete.findFirst({
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
      // Create a walk-in record for unknown visitors
      const walkIn = await db.walkIn.create({
        data: {
          gymId: DEFAULT_GYM_ID,
          name: name || email,
          email: email || null,
        },
      })

      return NextResponse.json({
        success: true,
        isWalkIn: true,
        data: {
          walkIn: {
            id: walkIn.id,
            name: walkIn.name,
            time: walkIn.checkInTime,
          },
        },
        matched: false,
        message: `Welcome! You've been checked in as a walk-in visitor. Please speak with a trainer to get set up.`,
      })
    }

    // Same path as the staff check-in: matches any session the athlete is on
    // the roster of (not only ones where they are the first name), uses the
    // gym's day rather than the server's, and marks them present on it.
    // Before, the kiosk matched only Session.athleteId, used the server's UTC
    // day, and marked the WHOLE session complete when the first kid arrived.
    const result = await staffCheckIn(DEFAULT_GYM_ID, athlete.id, null)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    const todaySession = result.sessionRecord ?? null
    const checkIn = { id: result.checkInId!, checkInTime: result.checkInTime! }

    let nextSession = null
    if (!todaySession) {
      nextSession = await db.session.findFirst({
        where: {
          attendees: { some: { athleteId: athlete.id } },
          scheduledAt: { gt: new Date() },
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
      message: result.already
        ? `You're already checked in, ${athlete.firstName}.`
        : todaySession
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
