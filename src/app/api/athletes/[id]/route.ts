import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { normalizePhone } from '@/lib/phone'
import { deleteAthletePermanently } from '@/lib/athletes'

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

    // Build update data. Every field is optional — the admin form sends only
    // what changed. Empty string means "clear it" for the nullable fields,
    // which is why they check `!== undefined` rather than truthiness.
    const updateData: Record<string, unknown> = {}
    if (body.firstName) updateData.firstName = String(body.firstName).trim()
    if (body.lastName) updateData.lastName = String(body.lastName).trim()
    if (body.email) updateData.email = String(body.email).toLowerCase().trim()

    if (body.phone !== undefined) {
      const raw = String(body.phone ?? '').trim()
      if (raw === '') {
        updateData.phone = null
      } else {
        const normalized = normalizePhone(raw)
        if (!normalized) {
          return NextResponse.json(
            {
              success: false,
              error: 'Enter a 10-digit US mobile number (e.g. 214-555-0123).',
            },
            { status: 400 }
          )
        }
        updateData.phone = normalized
      }
    }

    if (body.birthdate !== undefined) {
      const raw = String(body.birthdate ?? '').trim()
      if (raw === '') {
        updateData.birthdate = null
      } else {
        // Parsed as UTC midnight so the stored DATE can't drift a day either
        // way depending on where the server happens to be.
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        const parsed = m ? new Date(`${raw}T00:00:00.000Z`) : null
        if (!parsed || Number.isNaN(parsed.getTime())) {
          return NextResponse.json(
            { success: false, error: 'Birthdate must be YYYY-MM-DD.' },
            { status: 400 }
          )
        }
        updateData.birthdate = parsed
      }
    }

    if (body.address !== undefined) {
      const raw = String(body.address ?? '').trim()
      updateData.address = raw === '' ? null : raw
    }

    // Contact consent. emailOptOut only suppresses announcements — reminders
    // and booking confirmations are transactional and keep sending, or someone
    // who unsubscribed would stop learning when they train. smsOptIn is
    // opt-IN: no text goes out until someone actively says yes.
    if (body.emailOptOut !== undefined) updateData.emailOptOut = Boolean(body.emailOptOut)
    if (body.smsOptIn !== undefined) updateData.smsOptIn = Boolean(body.smsOptIn)

    // Reassignment is an admin action — a trainer must not be able to move an
    // athlete onto (or off) someone else's roster.
    if (body.trainerId !== undefined) {
      if (session.role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Only an admin can reassign a trainer.' },
          { status: 403 }
        )
      }
      const raw = body.trainerId === null ? null : String(body.trainerId).trim()
      if (raw === null || raw === '') {
        updateData.trainerId = null
      } else {
        const trainer = await db.trainer.findUnique({ where: { id: raw } })
        if (!trainer || trainer.gymId !== existingAthlete.gymId) {
          return NextResponse.json(
            { success: false, error: 'Trainer not found.' },
            { status: 400 }
          )
        }
        updateData.trainerId = raw
      }
    }

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

// DELETE /api/athletes/[id] - Permanently delete an athlete.
//
// Archive is the normal path (see POST /api/athletes/[id]/archive). This is
// the irreversible one, so it is admin-only and requires the caller to echo
// the athlete's full name back. That check is enforced here, not just in the
// UI — a confirmation dialog that only exists client-side is decoration.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only an admin can delete an athlete.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const athlete = await db.athlete.findUnique({ where: { id } })
    if (!athlete) {
      return NextResponse.json({ success: false, error: 'Athlete not found' }, { status: 404 })
    }

    const expected = `${athlete.firstName} ${athlete.lastName}`
    const confirmName = String(body.confirmName ?? '').trim()
    if (confirmName !== expected) {
      return NextResponse.json(
        {
          success: false,
          error: `To delete this athlete, confirm with their full name: "${expected}".`,
        },
        { status: 400 }
      )
    }

    const result = await deleteAthletePermanently(athlete.gymId, id)
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Error deleting athlete:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
