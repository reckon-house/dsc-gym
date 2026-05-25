// RFC 7009 — OAuth 2.0 Token Revocation.
// Clients (and the athlete from the dashboard) can call this to nuke
// an access or refresh token. Per spec we return 200 even if the
// token is unknown.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function readParams(request: NextRequest): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    return new URLSearchParams(text)
  }
  if (contentType.includes('application/json')) {
    try {
      const json = await request.json()
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === 'string') params.set(k, v)
      }
      return params
    } catch {
      return new URLSearchParams()
    }
  }
  return new URLSearchParams()
}

export async function POST(request: NextRequest) {
  const params = await readParams(request)
  const token = params.get('token')
  const tokenTypeHint = params.get('token_type_hint') // optional

  if (!token) {
    // Spec: still 200 on missing token? Actually invalid_request is allowed.
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'token is required.' },
      { status: 400 }
    )
  }

  const now = new Date()

  if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
    await db.oAuthAccessToken.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: now },
    })
  }
  if (tokenTypeHint === 'refresh_token' || !tokenTypeHint) {
    await db.oAuthRefreshToken.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: now },
    })
  }

  // Per RFC 7009, return 200 regardless of whether the token existed.
  return new NextResponse(null, { status: 200 })
}
