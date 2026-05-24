import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/athletes/verify?token=...
// Confirms an athlete's email. Idempotent: a second verify on an
// already-verified athlete returns success (so reload doesn't break).
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
    // Could be already verified (token cleared on success) or just bad.
    return NextResponse.json(
      {
        success: false,
        error: 'This verification link is invalid or has already been used. Try logging in.',
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
        error: 'This link has expired. Please re-register or ask the gym for a fresh link.',
      },
      { status: 400 }
    )
  }

  await db.athlete.update({
    where: { id: athlete.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  })

  return NextResponse.json({
    success: true,
    firstName: athlete.firstName,
    email: athlete.email,
  })
}
