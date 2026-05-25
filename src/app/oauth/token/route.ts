// RFC 6749 / OAuth 2.1 token endpoint.
// Supports two grant types:
//   - authorization_code (with PKCE)
//   - refresh_token
//
// Returns an opaque access token (bearer) + refresh token. We do NOT
// use JWTs for MCP access — they're stored server-side so we can
// revoke instantly.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  randomToken,
  verifyPkceS256,
} from '@/lib/oauth/util'

function errorResponse(
  code: string,
  description: string,
  status = 400
): NextResponse {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    }
  )
}

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
  // Fall back to form data parsing for multipart too.
  try {
    const form = await request.formData()
    const params = new URLSearchParams()
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') params.set(k, v)
    }
    return params
  } catch {
    return new URLSearchParams()
  }
}

export async function POST(request: NextRequest) {
  const params = await readParams(request)
  const grantType = params.get('grant_type')

  if (grantType === 'authorization_code') {
    return handleAuthCode(params)
  }
  if (grantType === 'refresh_token') {
    return handleRefresh(params)
  }
  return errorResponse('unsupported_grant_type', `grant_type=${grantType} not supported.`)
}

async function handleAuthCode(params: URLSearchParams): Promise<NextResponse> {
  const code = params.get('code')
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const codeVerifier = params.get('code_verifier')

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return errorResponse(
      'invalid_request',
      'code, client_id, redirect_uri, code_verifier are all required.'
    )
  }

  const record = await db.oAuthAuthorizationCode.findUnique({ where: { code } })
  if (!record) {
    return errorResponse('invalid_grant', 'Authorization code not found.')
  }
  if (record.usedAt) {
    // RFC 6749 §4.1.2 — codes are single-use. If we see it again, treat
    // it as a stolen code: revoke any tokens issued from it.
    await db.oAuthAccessToken.updateMany({
      where: { clientId: record.clientId, athleteId: record.athleteId },
      data: { revokedAt: new Date() },
    })
    await db.oAuthRefreshToken.updateMany({
      where: { clientId: record.clientId, athleteId: record.athleteId },
      data: { revokedAt: new Date() },
    })
    return errorResponse('invalid_grant', 'Authorization code already used.')
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return errorResponse('invalid_grant', 'Authorization code expired.')
  }
  if (record.clientId !== clientId) {
    return errorResponse('invalid_grant', 'Client mismatch on this code.')
  }
  if (record.redirectUri !== redirectUri) {
    return errorResponse('invalid_grant', 'redirect_uri mismatch.')
  }

  // PKCE verify.
  let ok = false
  try {
    ok = verifyPkceS256(codeVerifier, record.codeChallenge)
  } catch {
    ok = false
  }
  if (!ok) {
    return errorResponse('invalid_grant', 'PKCE verification failed.')
  }

  // Mark code used.
  await db.oAuthAuthorizationCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })

  // Issue tokens.
  return issueTokens(record.clientId, record.athleteId, record.scope)
}

async function handleRefresh(params: URLSearchParams): Promise<NextResponse> {
  const refreshToken = params.get('refresh_token')
  const clientId = params.get('client_id')
  if (!refreshToken || !clientId) {
    return errorResponse('invalid_request', 'refresh_token + client_id required.')
  }

  const record = await db.oAuthRefreshToken.findUnique({
    where: { token: refreshToken },
  })
  if (!record) {
    return errorResponse('invalid_grant', 'Unknown refresh token.')
  }
  if (record.revokedAt) {
    return errorResponse('invalid_grant', 'Refresh token revoked.')
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return errorResponse('invalid_grant', 'Refresh token expired.')
  }
  if (record.clientId !== clientId) {
    return errorResponse('invalid_grant', 'Client mismatch on refresh token.')
  }

  // Refresh token rotation: revoke the old, issue a new pair.
  await db.oAuthRefreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  })

  return issueTokens(record.clientId, record.athleteId, 'mcp')
}

async function issueTokens(
  clientId: string,
  athleteId: string,
  scope: string
): Promise<NextResponse> {
  const accessToken = randomToken()
  const refreshToken = randomToken()
  const now = Date.now()

  await db.$transaction([
    db.oAuthAccessToken.create({
      data: {
        token: accessToken,
        clientId,
        athleteId,
        scope,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
    }),
    db.oAuthRefreshToken.create({
      data: {
        token: refreshToken,
        clientId,
        athleteId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    }),
  ])

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope,
    },
    {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    }
  )
}
