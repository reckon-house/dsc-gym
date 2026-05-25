// Catch-all: per RFC 9728, the well-known URL for a resource includes
// the resource path. Claude.ai may probe /.well-known/oauth-protected-resource
// OR /.well-known/oauth-protected-resource/api/mcp/athlete — serve both
// the same metadata.

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
  })
}
