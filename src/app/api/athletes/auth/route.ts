// Athlete auth — distinct from the User-table auth used by Admin/Trainer.
// Issues a session cookie with role='ATHLETE' and athleteId.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'
import { normalizePhone } from '@/lib/phone'
import { findLoginGroup } from '@/lib/athleteAuth'
import { JWT_SECRET_RAW } from '@/lib/secrets'

const JWT_SECRET = new TextEncoder().encode(
  JWT_SECRET_RAW
)

// Accept either an email or a phone number as the identifier. We sniff
// the input — anything with '@' is treated as email, anything else we
// try to normalize as a US phone. The DB has unique constraints on both
// columns so the lookup is unambiguous either way.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Backwards-compatible: keep accepting { email, password } if
    // that's what's sent. Prefer the new { identifier, password }.
    const identifier: string | undefined = body.identifier ?? body.email
    const password: string | undefined = body.password
    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email or mobile and password are required' },
        { status: 400 }
      )
    }

    // A family shares one mailbox, so this returns every kid on it.
    const family = await findLoginGroup(identifier)

    // Credentials are family-wide (see setFamilyPassword), so any row with a
    // hash can answer the password check. Prefer the oldest.
    const athlete = family.find((a) => a.passwordHash) ?? null

    // Use a generic error so we don't leak which emails exist OR which
    // ones are archived.
    if (!athlete || !athlete.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }
    const ok = await verifyPassword(password, athlete.passwordHash)
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }
    if (!athlete.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please confirm your email first. Check your inbox for the verification link.',
          needsVerification: true,
        },
        { status: 403 }
      )
    }

    const token = await new SignJWT({
      role: 'ATHLETE',
      // Stays the ACTIVE athlete — every existing consumer of athleteId keeps
      // working unchanged; the switcher just re-signs with a different one.
      athleteId: athlete.id,
      athleteIds: family.map((a) => a.id),
      email: athlete.email,
      name: `${athlete.firstName} ${athlete.lastName}`,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(JWT_SECRET)

    const cookieStore = await cookies()
    cookieStore.set('athleteSession', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return NextResponse.json({
      success: true,
      athlete: {
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        email: athlete.email,
      },
    })
  } catch (error) {
    console.error('Athlete login error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    )
  }
}

// GET — return the current athlete session, if any.
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  if (!token) {
    return NextResponse.json({ success: false }, { status: 401 })
  }
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    // The dashboard renders a kid switcher when this comes back with more
    // than one. Read from the DB rather than the token so a name change or a
    // newly added sibling shows up without re-login.
    const ids = Array.isArray(payload.athleteIds)
      ? (payload.athleteIds as string[])
      : [payload.athleteId as string]
    const family = await db.athlete.findMany({
      where: { id: { in: ids }, archived: false },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      athlete: {
        id: payload.athleteId,
        name: payload.name,
        email: payload.email,
      },
      family,
    })
  } catch {
    return NextResponse.json({ success: false }, { status: 401 })
  }
}

// DELETE — log out
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('athleteSession')
  return NextResponse.json({ success: true })
}
