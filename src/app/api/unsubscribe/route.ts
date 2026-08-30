// One-click unsubscribe from announcements.
//
// Public by necessity — it's clicked from an inbox with no session. The token
// is an HMAC of the athlete id, so a link can't be forged or enumerated, and
// there's no token table to maintain.
//
// Only affects promotional mail. Session reminders and booking confirmations
// are transactional and keep sending; someone who stops getting those has no
// idea when they're training.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/blast'

function page(title: string, message: string, ok: boolean) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:'Avenir Next',system-ui,sans-serif;background:#fff;color:#141414;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">
<div style="max-width:420px;text-align:center;">
<div style="font-family:'SF Mono',Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8e8e8e;margin-bottom:8px;">Dallas Sport Collective</div>
<h1 style="font-size:32px;line-height:1.05;letter-spacing:-.04em;text-transform:uppercase;margin:0 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:1.5;color:#555;margin:0;">${message}</p>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

async function handle(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const athleteId = searchParams.get('a') ?? ''
  const token = searchParams.get('t') ?? ''

  if (!athleteId || !token || !verifyUnsubscribeToken(athleteId, token)) {
    return page('Link not valid', 'That unsubscribe link is invalid or incomplete.', false)
  }

  const athlete = await db.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) {
    return page('Link not valid', 'We could not find that account.', false)
  }

  await db.athlete.update({ where: { id: athleteId }, data: { emailOptOut: true } })

  return page(
    "You're unsubscribed",
    'You will not get gym announcements any more. Session reminders and booking confirmations still come through — reply to any of them if you would rather stop those too.',
    true
  )
}

export async function GET(request: NextRequest) {
  return handle(request)
}

// Mail clients that support one-click unsubscribe POST to the same URL.
export async function POST(request: NextRequest) {
  return handle(request)
}
