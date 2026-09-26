import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'

// POST /api/waiver - Check if waiver is signed or sign a new one
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, legalName, action } = body

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if waiver already signed
    if (action === 'check') {
      const existingWaiver = await db.waiverSignature.findFirst({
        where: { email: email.toLowerCase() },
        orderBy: { signedAt: 'desc' },
      })

      return NextResponse.json({
        success: true,
        signed: !!existingWaiver,
        waiver: existingWaiver ? {
          legalName: existingWaiver.legalName,
          signedAt: existingWaiver.signedAt,
        } : null,
      })
    }

    // Sign waiver
    if (action === 'sign') {
      if (!legalName || legalName.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'Full legal name is required' },
          { status: 400 }
        )
      }

      // Get IP address from headers
      const forwardedFor = request.headers.get('x-forwarded-for')
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

      // Check if athlete exists
      const athlete = await db.athlete.findFirst({
        where: { email: email.toLowerCase() },
      })

      const waiver = await db.waiverSignature.create({
        data: {
          gymId: DEFAULT_GYM_ID,
          email: email.toLowerCase(),
          legalName: legalName.trim(),
          ipAddress,
          athleteId: athlete?.id || null,
        },
      })

      // The kiosk signature used to be recorded but never reach the profile,
      // so an athlete who signed at the front desk still showed "Waiver
      // pending" to staff.
      // Only when the email is unambiguous: siblings share a parent's email,
      // and the kiosk doesn't say which child is signing.
      const sharing = athlete
        ? await db.athlete.count({ where: { email: email.toLowerCase(), archived: false } })
        : 0
      if (athlete && sharing === 1 && !athlete.waiverSignedAt) {
        await db.athlete.update({
          where: { id: athlete.id },
          data: { waiverSignedAt: waiver.signedAt, waiverTokenHash: null, waiverTokenExpiresAt: null },
        })
      }

      return NextResponse.json({
        success: true,
        waiver: {
          id: waiver.id,
          legalName: waiver.legalName,
          signedAt: waiver.signedAt,
        },
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Waiver error:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
