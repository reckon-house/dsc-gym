import { NextResponse } from 'next/server'

export async function GET() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || 'not set'
  const tursoToken = process.env.TURSO_AUTH_TOKEN ? 'set (length: ' + process.env.TURSO_AUTH_TOKEN.length + ')' : 'not set'

  return NextResponse.json({
    turso_url_starts: tursoUrl.substring(0, 30),
    turso_url_length: tursoUrl.length,
    turso_url_protocol: tursoUrl.split('://')[0],
    turso_token: tursoToken,
    node_env: process.env.NODE_ENV,
  })
}
