// What does the athlete's MCP/OAuth connection actually look like
// server-side? Surfaced on /athlete/dashboard so they can verify
// "connected" or "not connected" without relying on Claude.ai/ChatGPT's
// connector card (which can show a stale state).
//
// We look at the DB, not at any per-session cookie:
//   - Any active access token whose expiresAt > now ⇒ "connected"
//   - Most recent token usage gives us "last activity"
//   - Most recent client registration gives us "first connected"

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  let athleteId: string
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.role !== 'ATHLETE' || !payload.athleteId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    athleteId = payload.athleteId as string
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Any unexpired, unrevoked access token = currently connected.
  const activeToken = await db.oAuthAccessToken.findFirst({
    where: {
      athleteId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { client: { select: { name: true } } },
    orderBy: { expiresAt: 'desc' },
  })

  // Most recent token activity across ALL tokens (active or not) — tells
  // us when the connector last actually talked to us.
  const mostRecentlyUsed = await db.oAuthAccessToken.findFirst({
    where: {
      athleteId,
      lastUsedAt: { not: null },
    },
    orderBy: { lastUsedAt: 'desc' },
    select: { lastUsedAt: true, client: { select: { name: true } } },
  })

  // First connection ever — proxy = earliest non-revoked refresh token.
  // Useful for showing "connected since X" if we want to.
  const firstConnect = await db.oAuthRefreshToken.findFirst({
    where: { athleteId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  // Distinct client names this athlete has connected via — usually
  // just "Claude" or "ChatGPT" or both.
  const clients = await db.oAuthRefreshToken.findMany({
    where: { athleteId },
    distinct: ['clientId'],
    select: { client: { select: { name: true } } },
  })
  const clientNames = [
    ...new Set(clients.map((c) => c.client.name).filter((n): n is string => !!n)),
  ]

  return NextResponse.json({
    success: true,
    data: {
      connected: !!activeToken,
      // ISO strings; client computes "5m ago" / "yesterday" etc.
      lastUsedAt: mostRecentlyUsed?.lastUsedAt?.toISOString() ?? null,
      firstConnectedAt: firstConnect?.createdAt?.toISOString() ?? null,
      clientNames,
    },
  })
}
