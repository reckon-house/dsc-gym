// Outbound notifications for scheduling events.
//
// Five different code paths create sessions (admin panel, /api/sessions, the
// AI scheduler committing a draft, group bookings, and standing-slot
// materialization) and none of them used to tell anyone. They all call in here
// now, so the copy, the recipient rules and the idempotency live in one place.
//
// Two rules everything below obeys:
//
//  1. Claim before you send. A NotificationLog row with a unique dedupeKey is
//     written first; a collision means someone already sent this and we stop.
//     That makes cron re-runs, double tool-calls and retries harmless.
//  2. Never throw. These run inside `after()` where a rejection is invisible,
//     so failures are logged loudly instead.

import { db } from '@/lib/db'
import { sendEmail, buildSessionBookedEmail, buildSessionReminderEmail, buildStandingSlotDigestEmail, buildSessionIcs } from '@/lib/email'
import { sendSms, smsConfigured } from '@/lib/sms'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { formatInZone, formatTime } from '@/lib/scheduling/timezone'

/**
 * Addresses we must never send to.
 *
 * Three code paths mint `@placeholder.com` emails for athletes created without
 * one, and the seeded trainers carry `@dsc.com` addresses that don't exist.
 * Mailing either generates hard bounces, which is how a sending domain's
 * reputation gets destroyed.
 */
export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase().trim()
  if (!e.includes('@')) return false
  if (e.endsWith('@placeholder.com')) return false
  if (e.endsWith('@dsc.com')) return false
  if (e.includes('@example.')) return false
  return true
}

function baseUrl(): string {
  // No request origin exists in cron or in engine-level calls, so this must be
  // configured rather than inferred.
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')
  )
}

/**
 * Claim a dedupeKey. Returns the log id if this caller won the claim, or null
 * if someone already has it (P2002 on the unique index).
 */
async function claim(args: {
  gymId: string
  dedupeKey: string
  type: string
  channel: 'email' | 'sms'
  recipient: string
  sessionId?: string | null
  athleteId?: string | null
  trainerId?: string | null
  blastId?: string | null
}): Promise<string | null> {
  try {
    const row = await db.notificationLog.create({
      data: {
        gymId: args.gymId,
        dedupeKey: args.dedupeKey,
        type: args.type,
        channel: args.channel,
        recipient: args.recipient,
        sessionId: args.sessionId ?? null,
        athleteId: args.athleteId ?? null,
        trainerId: args.trainerId ?? null,
        blastId: args.blastId ?? null,
        status: 'pending',
      },
      select: { id: true },
    })
    return row.id
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null
    console.error('[notify] could not claim', args.dedupeKey, err)
    return null
  }
}

async function settle(logId: string, status: 'sent' | 'failed' | 'skipped', detail?: string) {
  try {
    await db.notificationLog.update({ where: { id: logId }, data: { status, detail: detail ?? null } })
  } catch (err) {
    console.error('[notify] could not settle log', logId, err)
  }
}

interface WhenStrings {
  whenHuman: string
  whenDayDate: string
  whenTimeRange: string
}

function formatWhen(startsAt: Date, durationMinutes: number, zone: string): WhenStrings {
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
  return {
    whenHuman: `${formatInZone(startsAt, zone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })}, ${formatTime(startsAt, zone)}`,
    whenDayDate: formatInZone(startsAt, zone, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    // The en-dash separator is what the existing templates split on.
    whenTimeRange: `${formatTime(startsAt, zone)} – ${formatTime(endsAt, zone)}`,
  }
}

/**
 * Tell everyone on a session that it exists.
 *
 * Called from every path that creates a session. Safe to call more than once
 * for the same session — the dedupe keys are per recipient email, which also
 * means a family sharing one address on a group session gets a single email.
 */
export async function notifySessionBooked(sessionId: string): Promise<void> {
  try {
    // Re-query rather than trusting a caller's snapshot: by the time this runs
    // the session may already have been cancelled.
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: {
        athlete: true,
        trainer: { include: { user: true } },
        attendees: { include: { athlete: true } },
      },
    })
    if (!session || session.cancelled) return

    const zone = await getGymTimezone(session.gymId)
    const when = formatWhen(session.scheduledAt, session.duration, zone)
    const dashboardUrl = `${baseUrl()}/athlete/dashboard`
    const logoUrl = process.env.EMAIL_LOGO_URL
    const heroImageUrl = process.env.EMAIL_HERO_URL

    // Attendee rows are authoritative for a group; fall back to the primary
    // athlete for older single sessions that never got an attendee row.
    const athletes = session.attendees.length
      ? session.attendees.map((a) => a.athlete)
      : [session.athlete]

    const ics = buildSessionIcs({
      uid: session.id,
      startsAt: session.scheduledAt,
      endsAt: new Date(session.scheduledAt.getTime() + session.duration * 60_000),
      trainerName: session.trainer.user.name,
      athleteName: athletes.map((a) => a.firstName).join(', '),
      location: 'Dallas Sport Collective',
    })

    const seen = new Set<string>()
    for (const athlete of athletes) {
      const email = athlete.email?.toLowerCase().trim()
      if (!isDeliverableEmail(email)) continue
      if (seen.has(email!)) continue
      seen.add(email!)

      const logId = await claim({
        gymId: session.gymId,
        dedupeKey: `booked:email:${session.id}:${email}`,
        type: 'session_booked',
        channel: 'email',
        recipient: email!,
        sessionId: session.id,
        athleteId: athlete.id,
      })
      if (!logId) continue

      const tpl = buildSessionBookedEmail({
        role: 'athlete',
        firstName: athlete.firstName,
        otherPartyName: session.trainer.user.name,
        ...when,
        durationMinutes: session.duration,
        dashboardUrl,
        logoUrl,
        heroImageUrl,
      })
      const { delivered } = await sendEmail({
        to: email!,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
        attachments: [
          { filename: 'dsc-session.ics', content: ics, contentType: 'text/calendar' },
        ],
      })
      await settle(logId, delivered ? 'sent' : 'failed')

      // SMS rides along only for athletes who opted in, and only once Twilio
      // is configured — otherwise this is a silent no-op.
      if (smsConfigured() && athlete.smsOptIn && athlete.phone) {
        const smsLogId = await claim({
          gymId: session.gymId,
          dedupeKey: `booked:sms:${session.id}:${athlete.phone}`,
          type: 'session_booked',
          channel: 'sms',
          recipient: athlete.phone,
          sessionId: session.id,
          athleteId: athlete.id,
        })
        if (smsLogId) {
          const r = await sendSms({
            to: athlete.phone,
            body: `DSC: you're booked ${when.whenDayDate}, ${when.whenTimeRange} with ${session.trainer.user.name}.`,
          })
          await settle(smsLogId, r.delivered ? 'sent' : 'failed', r.skipped)
        }
      }
    }

    // The trainer gets one notice naming everyone on the session.
    const trainerEmail = session.trainer.user.email?.toLowerCase().trim()
    if (isDeliverableEmail(trainerEmail)) {
      const logId = await claim({
        gymId: session.gymId,
        dedupeKey: `booked:email:${session.id}:${trainerEmail}`,
        type: 'session_booked',
        channel: 'email',
        recipient: trainerEmail!,
        sessionId: session.id,
        trainerId: session.trainerId,
      })
      if (logId) {
        const tpl = buildSessionBookedEmail({
          role: 'trainer',
          firstName: session.trainer.user.name.split(' ')[0],
          otherPartyName: athletes.map((a) => `${a.firstName} ${a.lastName}`).join(', '),
          ...when,
          durationMinutes: session.duration,
          dashboardUrl: `${baseUrl()}/admin/calendar`,
          logoUrl,
          heroImageUrl,
        })
        const { delivered } = await sendEmail({
          to: trainerEmail!,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        })
        await settle(logId, delivered ? 'sent' : 'failed')
      }
    }
  } catch (err) {
    console.error('[notify] notifySessionBooked failed for', sessionId, err)
  }
}

/**
 * One email when a standing slot is materialized, rather than one per week of
 * sessions it just created.
 */
export async function notifyStandingSlotMaterialized(
  slotId: string,
  created: { sessionId: string; scheduledAt: Date | string }[]
): Promise<void> {
  try {
    if (created.length === 0) return
    const slot = await db.athleteStandingSlot.findUnique({
      where: { id: slotId },
      include: { athlete: true },
    })
    if (!slot) return

    const athlete = slot.athlete
    const email = athlete.email?.toLowerCase().trim()
    if (!isDeliverableEmail(email)) return

    const zone = await getGymTimezone(athlete.gymId)
    const dates = created
      .map((c) => new Date(c.scheduledAt))
      .sort((a, b) => a.getTime() - b.getTime())
    const last = dates[dates.length - 1]

    const trainer = slot.trainerId
      ? await db.trainer.findUnique({
          where: { id: slot.trainerId },
          include: { user: true },
        })
      : null

    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    const h = Math.floor(slot.startMinute / 60)
    const m = slot.startMinute % 60
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const slotLabel = `${dayNames[slot.dayOfWeek]} at ${h12}:${String(m).padStart(2, '0')} ${period}`

    const logId = await claim({
      gymId: athlete.gymId,
      // Keyed on the furthest date so extending the slot later sends again,
      // but re-running the same materialization does not.
      dedupeKey: `standing:${slotId}:${last.toISOString().slice(0, 10)}`,
      type: 'standing_materialized',
      channel: 'email',
      recipient: email!,
      athleteId: athlete.id,
    })
    if (!logId) return

    const tpl = buildStandingSlotDigestEmail({
      firstName: athlete.firstName,
      trainerName: trainer?.user.name ?? 'your trainer',
      slotLabel,
      count: created.length,
      throughDate: formatInZone(last, zone, { month: 'short', day: 'numeric' }),
      dashboardUrl: `${baseUrl()}/athlete/dashboard`,
      logoUrl: process.env.EMAIL_LOGO_URL,
      heroImageUrl: process.env.EMAIL_HERO_URL,
    })
    const { delivered } = await sendEmail({
      to: email!,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
    })
    await settle(logId, delivered ? 'sent' : 'failed')
  } catch (err) {
    console.error('[notify] notifyStandingSlotMaterialized failed for', slotId, err)
  }
}

export interface ReminderRunReport {
  scanned: number
  sent: number
  alreadySent: number
  skippedBadEmail: string[]
  windowStart: string
  windowEnd: string
}

/**
 * How far ahead the reminder scan looks.
 *
 * A daily cron can fire anywhere inside its hour, and DST moves the wall clock
 * by an hour twice a year. An 18–42h window is 24h wide, so every session
 * lands in exactly one day's window regardless of that drift — no session is
 * reminded twice, none is missed. On a plan with hourly crons, narrow this to
 * [23,25] and change the schedule; nothing else needs touching.
 */
export const REMINDER_WINDOW_HOURS = { from: 18, to: 42 }

/** Send tomorrow's reminders to athletes and trainers. Idempotent. */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderRunReport> {
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_HOURS.from * 3600_000)
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS.to * 3600_000)

  const report: ReminderRunReport = {
    scanned: 0,
    sent: 0,
    alreadySent: 0,
    skippedBadEmail: [],
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }

  const sessions = await db.session.findMany({
    where: {
      cancelled: false,
      completed: false,
      scheduledAt: { gte: windowStart, lt: windowEnd },
    },
    include: {
      athlete: true,
      trainer: { include: { user: true } },
      attendees: { include: { athlete: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
  report.scanned = sessions.length

  for (const session of sessions) {
    const zone = await getGymTimezone(session.gymId)
    const when = formatWhen(session.scheduledAt, session.duration, zone)
    const logoUrl = process.env.EMAIL_LOGO_URL
    const heroImageUrl = process.env.EMAIL_HERO_URL

    const athletes = session.attendees.length
      ? session.attendees.map((a) => a.athlete)
      : [session.athlete]

    const seen = new Set<string>()
    for (const athlete of athletes) {
      const email = athlete.email?.toLowerCase().trim()
      if (!isDeliverableEmail(email)) {
        report.skippedBadEmail.push(`${athlete.firstName} ${athlete.lastName}`)
        continue
      }
      if (seen.has(email!)) continue
      seen.add(email!)

      const logId = await claim({
        gymId: session.gymId,
        dedupeKey: `reminder:email:${session.id}:a:${athlete.id}`,
        type: 'session_reminder',
        channel: 'email',
        recipient: email!,
        sessionId: session.id,
        athleteId: athlete.id,
      })
      if (!logId) {
        report.alreadySent++
        continue
      }

      const tpl = buildSessionReminderEmail({
        role: 'athlete',
        firstName: athlete.firstName,
        otherPartyName: session.trainer.user.name,
        whenDayDate: when.whenDayDate,
        whenTimeRange: when.whenTimeRange,
        durationMinutes: session.duration,
        dashboardUrl: `${baseUrl()}/athlete/dashboard`,
        logoUrl,
        heroImageUrl,
      })
      const { delivered } = await sendEmail({
        to: email!,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      })
      await settle(logId, delivered ? 'sent' : 'failed')
      if (delivered) report.sent++

      if (smsConfigured() && athlete.smsOptIn && athlete.phone) {
        const smsLogId = await claim({
          gymId: session.gymId,
          dedupeKey: `reminder:sms:${session.id}:a:${athlete.id}`,
          type: 'session_reminder',
          channel: 'sms',
          recipient: athlete.phone,
          sessionId: session.id,
          athleteId: athlete.id,
        })
        if (smsLogId) {
          const r = await sendSms({
            to: athlete.phone,
            body: `DSC reminder: ${when.whenDayDate}, ${when.whenTimeRange} with ${session.trainer.user.name}.`,
          })
          await settle(smsLogId, r.delivered ? 'sent' : 'failed', r.skipped)
        }
      }
    }

    const trainerEmail = session.trainer.user.email?.toLowerCase().trim()
    if (!isDeliverableEmail(trainerEmail)) {
      report.skippedBadEmail.push(`${session.trainer.user.name} (trainer)`)
    } else {
      const logId = await claim({
        gymId: session.gymId,
        dedupeKey: `reminder:email:${session.id}:t:${session.trainerId}`,
        type: 'session_reminder',
        channel: 'email',
        recipient: trainerEmail!,
        sessionId: session.id,
        trainerId: session.trainerId,
      })
      if (!logId) {
        report.alreadySent++
      } else {
        const tpl = buildSessionReminderEmail({
          role: 'trainer',
          firstName: session.trainer.user.name.split(' ')[0],
          otherPartyName: athletes.map((a) => `${a.firstName} ${a.lastName}`).join(', '),
          whenDayDate: when.whenDayDate,
          whenTimeRange: when.whenTimeRange,
          durationMinutes: session.duration,
          dashboardUrl: `${baseUrl()}/admin/calendar`,
          logoUrl,
          heroImageUrl,
        })
        const { delivered } = await sendEmail({
          to: trainerEmail!,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        })
        await settle(logId, delivered ? 'sent' : 'failed')
        if (delivered) report.sent++
      }
    }
  }

  // De-dupe the skip list so one bad trainer address doesn't repeat per session.
  report.skippedBadEmail = [...new Set(report.skippedBadEmail)]
  return report
}

/**
 * One digest per athlete when a group's weeks are materialized, rather than
 * one booking email per session per athlete.
 */
export async function notifyGroupMaterialized(
  groupId: string,
  created: { sessionId: string; scheduledAt: Date | string }[]
): Promise<void> {
  try {
    if (created.length === 0) return
    const group = await db.group.findUnique({
      where: { id: groupId },
      include: {
        members: { include: { athlete: true } },
        coaches: { include: { trainer: { include: { user: true } } } },
      },
    })
    if (!group) return

    const zone = await getGymTimezone(group.gymId)
    const dates = created
      .map((c) => new Date(c.scheduledAt))
      .sort((a, b) => a.getTime() - b.getTime())
    const last = dates[dates.length - 1]

    const lead = group.coaches.find((c) => c.isLead) ?? group.coaches[0]
    const coachNames = group.coaches.map((c) => c.trainer.user.name).join(' & ')

    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    const startMinute = group.startMinute ?? 0
    const h = Math.floor(startMinute / 60)
    const m = startMinute % 60
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const slotLabel = `${group.name} — ${dayNames[group.dayOfWeek ?? 0]} at ${h12}:${String(m).padStart(2, '0')} ${period}`

    const seen = new Set<string>()
    for (const member of group.members) {
      const athlete = member.athlete
      if (athlete.archived) continue
      const email = athlete.email?.toLowerCase().trim()
      if (!isDeliverableEmail(email)) continue
      if (seen.has(email!)) continue
      seen.add(email!)

      const logId = await claim({
        gymId: group.gymId,
        dedupeKey: `group:${groupId}:${last.toISOString().slice(0, 10)}:${email}`,
        type: 'standing_materialized',
        channel: 'email',
        recipient: email!,
        athleteId: athlete.id,
      })
      if (!logId) continue

      const tpl = buildStandingSlotDigestEmail({
        firstName: athlete.firstName,
        trainerName: coachNames || lead?.trainer.user.name || 'your coaches',
        slotLabel,
        count: created.length,
        throughDate: formatInZone(last, zone, { month: 'short', day: 'numeric' }),
        dashboardUrl: `${baseUrl()}/athlete/dashboard`,
        logoUrl: process.env.EMAIL_LOGO_URL,
        heroImageUrl: process.env.EMAIL_HERO_URL,
      })
      const { delivered } = await sendEmail({
        to: email!,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      })
      await settle(logId, delivered ? 'sent' : 'failed')
    }
  } catch (err) {
    console.error('[notify] notifyGroupMaterialized failed for', groupId, err)
  }
}
