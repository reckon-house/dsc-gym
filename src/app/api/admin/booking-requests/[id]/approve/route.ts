// Approve a BookingRequest. Re-validates through the engine and, if
// clean, creates the actual Session. Marks the request approved and
// links it to the resulting sessionId.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGymTimezone, validateBooking } from '@/lib/scheduling/engine'
import { formatInZone, formatHuman } from '@/lib/scheduling/timezone'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import {
  buildSessionApprovedEmail,
  buildSessionIcs,
  sendEmail,
} from '@/lib/email'
import { publicBaseUrl } from '@/lib/oauth/util'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = request.headers.get('x-user-id') || null

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

  const validation = await validateBooking(DEFAULT_GYM_ID, {
    trainerId: req.trainerId,
    athleteId: req.athleteId,
    scheduledAt: req.scheduledAt,
    duration: req.duration,
  })

  if (!validation.ok) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      conflicts: validation.conflicts,
    }, { status: 409 })
  }

  const session = await db.session.create({
    data: {
      gymId: req.gymId,
      trainerId: req.trainerId,
      athleteId: req.athleteId,
      scheduledAt: req.scheduledAt,
      duration: req.duration,
      notes: req.notes,
    },
  })

  await db.bookingRequest.update({
    where: { id },
    data: {
      status: 'approved',
      resolvedAt: new Date(),
      resolvedBy: userId,
      sessionId: session.id,
    },
  })

  // Notify the athlete. Fire-and-forget — failure to send the email
  // shouldn't fail the approval.
  void sendApprovalEmail(request, id).catch((err) => {
    console.error('approval email failed:', err)
  })

  return NextResponse.json({ success: true, sessionId: session.id })
}

async function sendApprovalEmail(request: NextRequest, requestId: string) {
  const row = await db.bookingRequest.findUnique({
    where: { id: requestId },
    include: {
      athlete: { select: { firstName: true, lastName: true, email: true } },
      trainer: { include: { user: { select: { name: true } } } },
    },
  })
  if (!row) return
  const zone = await getGymTimezone(row.gymId)
  const endsAt = new Date(row.scheduledAt.getTime() + row.duration * 60_000)
  const whenHuman = formatHuman(row.scheduledAt, zone)
  const whenDayDate = formatInZone(row.scheduledAt, zone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const startStr = formatInZone(row.scheduledAt, zone, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endStr = formatInZone(endsAt, zone, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const base = publicBaseUrl(request.nextUrl.origin)
  const tpl = buildSessionApprovedEmail({
    firstName: row.athlete.firstName,
    trainerName: row.trainer.user.name,
    whenHuman,
    whenDayDate,
    whenTimeRange: `${startStr} – ${endStr}`,
    durationMinutes: row.duration,
    dashboardUrl: `${base}/athlete/dashboard`,
    logoUrl: process.env.EMAIL_LOGO_URL || `${base}/logo-mark.png`,
    heroImageUrl: process.env.EMAIL_HERO_URL,
  })
  const ics = buildSessionIcs({
    uid: row.id,
    startsAt: row.scheduledAt,
    endsAt,
    trainerName: row.trainer.user.name,
    athleteName: `${row.athlete.firstName} ${row.athlete.lastName}`,
    location: 'Dallas Sports Collective',
    description: `Training session with ${row.trainer.user.name}.`,
  })
  await sendEmail({
    to: row.athlete.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    attachments: [
      { filename: 'dsc-session.ics', content: ics, contentType: 'text/calendar' },
    ],
  })
}
