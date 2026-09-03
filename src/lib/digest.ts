// The morning digest: today's floor, emailed before anyone gets there.
//
// Deliberately coach-and-admin only by default. Families already receive a
// reminder roughly 24 hours before each session, so mailing them again the
// same morning is a second message about the same thing — that is how a
// useful notification becomes something people filter. GymConfig.digestToFamilies
// turns it on for families when the gym decides it wants that.
//
// Same two rules as the rest of notify: claim a NotificationLog row before
// sending so a re-run mails nobody twice, and never throw, because this runs
// inside a cron where a rejection is invisible.

import { db } from '@/lib/db'
import { sendEmail, buildDailyDigestEmail } from '@/lib/email'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { startOfDayInZone, endOfDayInZone, formatInZone, formatTime } from '@/lib/scheduling/timezone'
import { isDeliverableEmail } from '@/lib/notify'

export interface DigestReport {
  date: string
  sentToStaff: number
  sentToFamilies: number
  skippedNoSessions: string[]
  skippedBadEmail: string[]
  alreadySent: number
  failed: number
}

interface Line {
  time: string
  who: string
  detail: string
}

export async function sendDailyDigest(
  gymId: string,
  now: Date = new Date()
): Promise<DigestReport> {
  const zone = await getGymTimezone(gymId)
  const dayStart = startOfDayInZone(now, zone)
  const dayEnd = endOfDayInZone(now, zone)
  const dateLabel = formatInZone(now, zone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const report: DigestReport = {
    date: dateLabel,
    sentToStaff: 0,
    sentToFamilies: 0,
    skippedNoSessions: [],
    skippedBadEmail: [],
    alreadySent: 0,
    failed: 0,
  }

  const [sessions, meetings, config] = await Promise.all([
    db.session.findMany({
      where: { gymId, cancelled: false, scheduledAt: { gte: dayStart, lt: dayEnd } },
      include: {
        attendees: { include: { athlete: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        athlete: { select: { id: true, firstName: true, lastName: true, email: true } },
        trainer: { include: { user: { select: { id: true, name: true, email: true } } } },
        coaches: { include: { trainer: { include: { user: { select: { id: true, name: true, email: true } } } } } },
        group: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    }),
    db.calendarEvent.findMany({
      where: { gymId, cancelled: false, startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startsAt: 'asc' },
    }),
    db.gymConfig.findUnique({ where: { gymId } }),
  ])

  const dayUrl = `${baseUrl()}/admin/calendar/${formatInZone(now, zone, {
    year: 'numeric',
  })}-${formatInZone(now, zone, { month: '2-digit' })}-${formatInZone(now, zone, { day: '2-digit' })}`

  // ---- staff ----------------------------------------------------------
  // Every coach on a session, not just the lead: an assisting coach needs
  // their morning to include the class they are actually working.
  const staff = new Map<string, { name: string; email: string; lines: Line[] }>()

  const noteStaff = (userId: string, name: string, email: string, line: Line) => {
    const row = staff.get(userId) ?? { name, email, lines: [] }
    row.lines.push(line)
    staff.set(userId, row)
  }

  for (const s of sessions) {
    const roster = s.attendees.length ? s.attendees.map((a) => a.athlete) : [s.athlete]
    const who = s.group?.name
      ? `${s.group.name} (${roster.length})`
      : roster.length > 1
        ? `${roster[0].firstName} +${roster.length - 1}`
        : `${roster[0].firstName} ${roster[0].lastName}`
    const names = roster.map((a) => `${a.firstName} ${a.lastName}`).join(', ')
    const line: Line = {
      time: formatTime(s.scheduledAt, zone),
      who,
      detail: `${s.duration} min · ${names}`,
    }
    const seen = new Set<string>()
    for (const c of [s.trainer, ...s.coaches.map((c) => c.trainer)]) {
      if (seen.has(c.user.id)) continue
      seen.add(c.user.id)
      noteStaff(c.user.id, c.user.name, c.user.email, line)
    }
  }

  // Meetings land on everyone they name; an all-staff meeting reaches all.
  const allStaffUsers = await db.user.findMany({ select: { id: true, name: true, email: true } })
  const trainerToUser = new Map(
    (
      await db.trainer.findMany({ include: { user: { select: { id: true, name: true, email: true } } } })
    ).map((t) => [t.id, t.user])
  )
  for (const m of meetings) {
    const line: Line = {
      time: formatTime(m.startsAt, zone),
      who: m.title,
      detail: `${m.duration} min · meeting`,
    }
    const targets = m.trainerIds.length
      ? m.trainerIds.map((id) => trainerToUser.get(id)).filter(Boolean)
      : allStaffUsers
    for (const u of targets) if (u) noteStaff(u.id, u.name, u.email, line)
  }

  for (const [userId, row] of staff) {
    if (!isDeliverableEmail(row.email)) {
      report.skippedBadEmail.push(`${row.name} (staff)`)
      continue
    }
    const sent = await deliver({
      gymId,
      dedupeKey: `digest:staff:${ymd(now, zone)}:${userId}`,
      to: row.email,
      subject: `Today at DSC — ${dateLabel}`,
      firstName: row.name.split(' ')[0],
      dateLabel,
      lines: row.lines.sort(byTime),
      url: dayUrl,
      audience: 'staff',
    })
    if (sent === 'sent') report.sentToStaff++
    else if (sent === 'duplicate') report.alreadySent++
    else report.failed++
  }

  // Anyone rostered nowhere today gets nothing rather than an empty email.
  const quiet = allStaffUsers.filter((u) => !staff.has(u.id)).map((u) => u.name)
  report.skippedNoSessions = quiet

  // ---- families (off unless the gym turns it on) ----------------------
  if (config?.digestToFamilies) {
    const byMailbox = new Map<string, { firstNames: Set<string>; lines: Line[]; athleteId: string }>()
    for (const s of sessions) {
      const roster = s.attendees.length ? s.attendees.map((a) => a.athlete) : [s.athlete]
      for (const a of roster) {
        const email = a.email?.toLowerCase().trim()
        if (!isDeliverableEmail(email)) continue
        const row = byMailbox.get(email!) ?? { firstNames: new Set<string>(), lines: [], athleteId: a.id }
        row.firstNames.add(a.firstName)
        row.lines.push({
          time: formatTime(s.scheduledAt, zone),
          who: a.firstName,
          detail: `${s.duration} min with ${s.trainer.user.name}`,
        })
        byMailbox.set(email!, row)
      }
    }
    for (const [email, row] of byMailbox) {
      const sent = await deliver({
        gymId,
        dedupeKey: `digest:family:${ymd(now, zone)}:${email}`,
        to: email,
        subject: `Today's training — ${dateLabel}`,
        firstName: row.firstNames.size === 1 ? [...row.firstNames][0] : null,
        dateLabel,
        lines: row.lines.sort(byTime),
        url: `${baseUrl()}/athlete/dashboard`,
        audience: 'family',
      })
      if (sent === 'sent') report.sentToFamilies++
      else if (sent === 'duplicate') report.alreadySent++
      else report.failed++
    }
  }

  return report
}

function byTime(a: Line, b: Line) {
  return a.time.localeCompare(b.time, undefined, { numeric: true })
}

function ymd(d: Date, zone: string) {
  return `${formatInZone(d, zone, { year: 'numeric' })}-${formatInZone(d, zone, {
    month: '2-digit',
  })}-${formatInZone(d, zone, { day: '2-digit' })}`
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')
  )
}

async function deliver(args: {
  gymId: string
  dedupeKey: string
  to: string
  subject: string
  firstName: string | null
  dateLabel: string
  lines: Line[]
  url: string
  audience: 'staff' | 'family'
}): Promise<'sent' | 'failed' | 'duplicate'> {
  let logId: string
  try {
    const row = await db.notificationLog.create({
      data: {
        gymId: args.gymId,
        dedupeKey: args.dedupeKey,
        type: `digest_${args.audience}`,
        channel: 'email',
        recipient: args.to,
        status: 'pending',
      },
      select: { id: true },
    })
    logId = row.id
  } catch {
    return 'duplicate'
  }

  try {
    const tpl = buildDailyDigestEmail({
      firstName: args.firstName,
      dateLabel: args.dateLabel,
      lines: args.lines,
      url: args.url,
      audience: args.audience,
      logoUrl: process.env.EMAIL_LOGO_URL,
    })
    const { delivered } = await sendEmail({
      to: args.to,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
    })
    await db.notificationLog.update({
      where: { id: logId },
      data: { status: delivered ? 'sent' : 'failed' },
    })
    return delivered ? 'sent' : 'failed'
  } catch (err) {
    console.error('[digest] send failed', args.to, err)
    await db.notificationLog
      .update({ where: { id: logId }, data: { status: 'failed' } })
      .catch(() => {})
    return 'failed'
  }
}
