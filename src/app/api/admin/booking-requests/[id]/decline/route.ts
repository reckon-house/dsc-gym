// Decline a BookingRequest. Optional reason makes its way back to the
// athlete via their MCP client / dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { formatHuman } from '@/lib/scheduling/timezone'
import { buildSessionDeclinedEmail, sendEmail } from '@/lib/email'
import { publicBaseUrl } from '@/lib/oauth/util'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = request.headers.get('x-user-id') || null

  let body: { reason?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* no body */
  }

  const req = await db.bookingRequest.findUnique({ where: { id } })
  if (!req) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (req.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Already ${req.status}.` },
      { status: 400 }
    )
  }

  const reason = body.reason?.trim() || null
  await db.bookingRequest.update({
    where: { id },
    data: {
      status: 'declined',
      declineReason: reason,
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  })

  void sendDeclineEmail(request, id).catch((err) => {
    console.error('decline email failed:', err)
  })

  return NextResponse.json({ success: true })
}

async function sendDeclineEmail(request: NextRequest, requestId: string) {
  const row = await db.bookingRequest.findUnique({
    where: { id: requestId },
    include: {
      athlete: { select: { firstName: true, email: true } },
      trainer: { include: { user: { select: { name: true } } } },
    },
  })
  if (!row) return
  const zone = await getGymTimezone(row.gymId)
  const whenHuman = formatHuman(row.scheduledAt, zone)
  const base = publicBaseUrl(request.nextUrl.origin)
  const tpl = buildSessionDeclinedEmail({
    firstName: row.athlete.firstName,
    trainerName: row.trainer.user.name,
    whenHuman,
    reason: row.declineReason,
    dashboardUrl: `${base}/athlete/dashboard`,
    logoUrl: process.env.EMAIL_LOGO_URL || `${base}/logo-mark.png`,
    heroImageUrl: process.env.EMAIL_HERO_URL,
  })
  await sendEmail({
    to: row.athlete.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  })
}
