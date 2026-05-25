// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
// Tells MCP clients (Claude.ai) which auth server protects this resource.

import { NextRequest, NextResponse } from 'next/server'
import { publicBaseUrl } from '@/lib/oauth/util'

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') ?? request.nextUrl.origin
  const base = publicBaseUrl(origin)
  return NextResponse.json({
    resource: `${base}/api/mcp/athlete`,
    authorization_servers: [base],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${base}/athlete/dashboard`,
    // Branding for MCP connector UIs.
    resource_name: 'Dallas Sports Collective',
    logo_uri: `${base}/logo-mark.png`,
  })
}
