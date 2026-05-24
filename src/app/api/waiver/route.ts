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
      const athlete = await db.athlete.findUnique({
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
