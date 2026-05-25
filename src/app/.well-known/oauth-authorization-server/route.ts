// RFC 8414 — OAuth 2.0 Authorization Server Metadata.
// Claude.ai fetches this to learn how to do OAuth with us.

import { NextRequest, NextResponse } from 'next/server'
import { publicBaseUrl } from '@/lib/oauth/util'

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') ?? request.nextUrl.origin
  const base = publicBaseUrl(origin)

  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], // public clients, PKCE
    scopes_supported: ['mcp'],
    service_documentation: `${base}/athlete/dashboard`,
    // Branding hints (non-standard but read by MCP connector UIs).
    op_policy_uri: `${base}/athlete`,
    logo_uri: `${base}/logo-mark.png`,
    op_name: 'Dallas Sports Collective',
  })
}
