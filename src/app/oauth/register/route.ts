// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
// Claude.ai posts here to register itself, gets back a client_id.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomToken } from '@/lib/oauth/util'

interface RegisterBody {
  client_name?: string
  redirect_uris?: string[]
  // (other fields per spec ignored for MVP)
  token_endpoint_auth_method?: string
  grant_types?: string[]
  response_types?: string[]
  scope?: string
}

export async function POST(request: NextRequest) {
  let body: RegisterBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Body must be JSON.' },
      { status: 400 }
    )
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'At least one redirect_uri is required.',
      },
      { status: 400 }
    )
  }
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri)
      // Reject anything that isn't https except for localhost / loopback.
      const isLocal =
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '::1'
      if (u.protocol !== 'https:' && !isLocal) {
        return NextResponse.json(
          {
            error: 'invalid_redirect_uri',
            error_description: `redirect_uri must use https (got ${uri}).`,
          },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        {
          error: 'invalid_redirect_uri',
          error_description: `redirect_uri is not a valid URL: ${uri}`,
        },
        { status: 400 }
      )
    }
  }

  // Public clients only (PKCE flow). No client_secret issued.
  const clientId = randomToken()
  const created = await db.oAuthClient.create({
    data: {
      clientId,
      name: body.client_name?.trim() || null,
      redirectUris,
      source: 'dynamic',
    },
  })

  return NextResponse.json(
    {
      client_id: created.clientId,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      redirect_uris: created.redirectUris,
      client_name: created.name ?? undefined,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'mcp',
    },
    { status: 201 }
  )
}
