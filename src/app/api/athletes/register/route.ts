import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import {
  buildVerificationEmail,
  generateVerificationToken,
  sendEmail,
} from '@/lib/email'

// POST /api/athletes/register - Public athlete self-registration.
// Creates an unverified athlete and sends a verification email.
// Login is blocked until the email is verified.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { firstName, lastName, email, phone, password, legalName } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'First name and last name are required' },
        { status: 400 }
      )
    }
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }
    if (!legalName) {
      return NextResponse.json(
        { success: false, error: 'Legal name is required for waiver' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const existing = await db.athlete.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password)
    const token = generateVerificationToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    const athlete = await db.athlete.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || null,
        passwordHash,
        trainerId: null,
        emailVerified: false,
        emailVerificationToken: token,
        emailVerificationExpiresAt: expiresAt,
      },
    })

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

    await db.waiverSignature.create({
      data: {
        gymId: DEFAULT_GYM_ID,
        email: normalizedEmail,
        legalName: legalName.trim(),
        ipAddress,
        athleteId: athlete.id,
      },
    })

    // Build verification URL. We use the request origin so it works
    // in dev (localhost), preview, and production.
    const origin = request.headers.get('origin') ?? `http://${request.headers.get('host') ?? 'localhost:3000'}`
    const verificationUrl = `${origin}/athlete/verify?token=${token}`

    // Hero image URL. Lets us swap to a CDN/optimized version via env var
    // without changing code. Falls back to a public asset.
    const heroImageUrl =
      process.env.EMAIL_HERO_URL ?? `${origin}/checkin-bg.jpg`

    const email_content = buildVerificationEmail({
      firstName: athlete.firstName,
      url: verificationUrl,
      heroImageUrl,
    })
    const emailResult = await sendEmail({
      to: normalizedEmail,
      ...email_content,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          email: athlete.email,
        },
        // In dev (no email service configured), expose the URL so the
        // user can click it directly. In prod with Resend wired up,
        // this still echoes but the real link is in the inbox.
        verificationUrl: emailResult.delivered ? null : verificationUrl,
        emailDelivered: emailResult.delivered,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error registering athlete:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during registration'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
