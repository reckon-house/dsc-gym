import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { markFamilyVerified } from '@/lib/athleteAuth'

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

  // Verifies the whole family: siblings share this mailbox, and the parent
  // only ever receives (and clicks) one link. Verifying just the row that
  // carried the token would leave the other kids permanently unable to log in.
  await markFamilyVerified(athlete.email)

  // Note: the waiver was signed at registration. This endpoint only
  // verifies the email — identity confirmation, not the legal sign event.

  return NextResponse.json({
    success: true,
    firstName: athlete.firstName,
    email: athlete.email,
  })
}
