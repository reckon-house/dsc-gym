// POST target of the consent form (/oauth/authorize). On approve,
// mints a single-use authorization code and redirects back to the
// client's redirect_uri. On deny, redirects back with error=access_denied.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'
import {
  AUTH_CODE_TTL_SECONDS,
  isAllowedRedirectUri,
  randomToken,
} from '@/lib/oauth/util'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

function redirectWithParams(
  redirectUri: string,
  params: Record<string, string>
): NextResponse {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url.toString(), { status: 303 })
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const client_id = String(form.get('client_id') ?? '')
  const redirect_uri = String(form.get('redirect_uri') ?? '')
  const code_challenge = String(form.get('code_challenge') ?? '')
  const code_challenge_method = String(form.get('code_challenge_method') ?? '')
  const state = String(form.get('state') ?? '')
  const scope = String(form.get('scope') ?? 'mcp')
  const decision = String(form.get('decision') ?? '')

  // ----- Validate everything before considering trusting the redirect -----
  if (!client_id || !redirect_uri || !code_challenge) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters.' },
      { status: 400 }
    )
  }
  if (code_challenge_method !== 'S256') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Only S256 supported.' },
      { status: 400 }
    )
  }

  const client = await db.oAuthClient.findUnique({
    where: { clientId: client_id },
  })
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client.' },
      { status: 400 }
    )
  }
  if (!isAllowedRedirectUri(redirect_uri, client.redirectUris)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'redirect_uri mismatch.' },
      { status: 400 }
    )
  }

  // ----- Auth check (must still be logged in) -----
  const cookieStore = await cookies()
  const token = cookieStore.get('athleteSession')?.value
  let athleteId: string | null = null
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      if (payload.role === 'ATHLETE' && payload.athleteId) {
        athleteId = payload.athleteId as string
      }
    } catch {
      /* not logged in */
    }
  }
  if (!athleteId) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Athlete not authenticated.' },
      { status: 401 }
    )
  }

  // ----- Deny path -----
  if (decision !== 'approve') {
    return redirectWithParams(redirect_uri, {
      error: 'access_denied',
      error_description: 'The user declined the request.',
      ...(state ? { state } : {}),
    })
  }

  // ----- Approve: mint single-use code -----
  const code = randomToken()
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000)
  await db.oAuthAuthorizationCode.create({
    data: {
      code,
      clientId: client_id,
      athleteId,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      scope: scope || 'mcp',
      expiresAt,
    },
  })

  return redirectWithParams(redirect_uri, {
    code,
    ...(state ? { state } : {}),
  })
}
