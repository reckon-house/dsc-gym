import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/athletes/verify?token=...
// Confirms an athlete's email AND records the formal waiver acknowledgment.
// The /athlete/verify page only calls this after the user explicitly
// checks "I have read and agree" — so a successful response is also a
// signed-waiver event.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Missing token' },
      { status: 400 }
    )
  }

  const athlete = await db.athlete.findUnique({
    where: { emailVerificationToken: token },
  })
  if (!athlete) {
    return NextResponse.json(
      {
        success: false,
        error:
          'This verification link is invalid or has already been used. Try logging in.',
      },
      { status: 400 }
    )
  }

  if (athlete.emailVerified) {
    return NextResponse.json({ success: true, alreadyVerified: true })
  }

  if (
    athlete.emailVerificationExpiresAt &&
    athlete.emailVerificationExpiresAt < new Date()
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'This link has expired. Please re-register or ask the gym for a fresh link.',
      },
      { status: 400 }
    )
  }

  const now = new Date()
  await db.athlete.update({
    where: { id: athlete.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      waiverSignedAt: now,
    },
  })

  // Stamp the existing WaiverSignature row's signedAt with the actual
  // confirmation time and capture the IP for audit. (We created the row
  // at registration with a placeholder "intent" time.)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'
  await db.waiverSignature.updateMany({
    where: { athleteId: athlete.id },
    data: { signedAt: now, ipAddress },
  })

  return NextResponse.json({
    success: true,
    firstName: athlete.firstName,
    email: athlete.email,
  })
}
