// POST /api/athletes/auth/switch — change which kid the parent is looking at.
//
// Re-signs the session cookie with a different active athleteId. Every /me
// route reads athleteId from that cookie, so they all follow automatically.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    payload = verified.payload as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (payload.role !== 'ATHLETE') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const targetId = String(body.athleteId ?? '')
  if (!targetId) {
    return NextResponse.json({ success: false, error: 'athleteId is required' }, { status: 400 })
  }

  // Tokens issued before families existed have no sibling list. Rather than
  // guessing, make them sign in again — that mints a token that knows the family.
  const ids = Array.isArray(payload.athleteIds) ? (payload.athleteIds as string[]) : null
  if (!ids) {
    return NextResponse.json(
      { success: false, error: 'Please sign in again to switch athletes.' },
      { status: 409 }
    )
  }
  if (!ids.includes(targetId)) {
    return NextResponse.json({ success: false, error: 'Not your athlete.' }, { status: 403 })
  }

  // Re-check against the DB: the token can be 30 days old, and the target may
  // have been archived or moved to a different mailbox since it was issued.
  const target = await db.athlete.findUnique({ where: { id: targetId } })
  if (!target || target.archived || target.email.toLowerCase() !== String(payload.email).toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Not available.' }, { status: 403 })
  }

  const next = await new SignJWT({
    role: 'ATHLETE',
    athleteId: target.id,
    athleteIds: ids,
    email: target.email,
    name: `${target.firstName} ${target.lastName}`,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET)

  cookieStore.set('athleteSession', next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })

  return NextResponse.json({
    success: true,
    athlete: { id: target.id, name: `${target.firstName} ${target.lastName}` },
  })
}
