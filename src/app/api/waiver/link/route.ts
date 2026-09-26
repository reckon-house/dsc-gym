// Public: sign a waiver from an emailed link. The token is the credential —
// see src/lib/waiverLink.ts.
//
// GET  ?t=token          → who the link is for (first/last name only)
// POST { t, legalName, agree: true }

import { NextRequest, NextResponse } from 'next/server'
import { findByWaiverToken, signWithToken } from '@/lib/waiverLink'

const REASON: Record<string, string> = {
  invalid: 'This link is no longer valid — it may already have been used. Ask the gym to send a new one if you still need to sign.',
  expired: 'This link has expired. Ask the gym to send a new one.',
  signed: 'This waiver has already been signed. You’re all set.',
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t') ?? ''
  const found = await findByWaiverToken(t)
  if (!found.ok) {
    return NextResponse.json({ success: false, reason: found.reason, error: REASON[found.reason] })
  }
  return NextResponse.json({
    success: true,
    data: { firstName: found.athlete.firstName, lastName: found.athlete.lastName },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const legalName = String(body.legalName ?? '').trim()
    if (body.agree !== true) {
      return NextResponse.json(
        { success: false, error: 'Please confirm you have read and agree to the waiver.' },
        { status: 400 }
      )
    }
    if (legalName.length < 2 || legalName.length > 120) {
      return NextResponse.json(
        { success: false, error: 'Type your full legal name to sign.' },
        { status: 400 }
      )
    }
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown'

    const result = await signWithToken(String(body.t ?? ''), legalName, ip)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, data: { firstName: result.firstName } })
  } catch (error) {
    console.error('Waiver link sign error:', error)
    return NextResponse.json({ success: false, error: 'An error occurred' }, { status: 500 })
  }
}
