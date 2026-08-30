// Email blasts: announcements to everyone, a group, or an age band.
//
// Two-step by design, mirroring the scheduler's propose→commit: a draft
// freezes the audience and the copy and reports who it would reach; sending is
// a separate, explicit act. "Send an email to the basketball players" is a
// request to DRAFT one.
//
// Blasts are promotional, so they respect Athlete.emailOptOut and carry an
// unsubscribe link. Reminders and booking confirmations are transactional and
// deliberately ignore that flag.

import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { sendEmail, buildBlastEmail } from '@/lib/email'
import { isDeliverableEmail } from '@/lib/notify'

export type AudienceSpec =
  | { kind: 'all' }
  | { kind: 'group'; groupId?: string; groupName?: string }
  | { kind: 'age_band'; minAge?: number; maxAge?: number }

export interface AudienceRecipient {
  athleteId: string
  email: string
  firstName: string
  lastName: string
}

export interface ResolvedAudience {
  recipients: AudienceRecipient[]
  /** Distinct mailboxes — a family sharing an address counts once. */
  uniqueEmails: number
  label: string
  excluded: { optedOut: number; badEmail: number; noBirthdate: number }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production'

/** Stateless, so unsubscribe needs no token table and never expires. */
export function unsubscribeToken(athleteId: string): string {
  return createHmac('sha256', JWT_SECRET).update(`unsub:${athleteId}`).digest('hex')
}

export function verifyUnsubscribeToken(athleteId: string, token: string): boolean {
  const expected = unsubscribeToken(athleteId)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function buildUnsubscribeUrl(athleteId: string, base: string): string {
  return `${base}/api/unsubscribe?a=${athleteId}&t=${unsubscribeToken(athleteId)}`
}

function ageToBirthdateRange(minAge?: number, maxAge?: number) {
  // Someone who is minAge was born on or before (today - minAge years).
  const now = new Date()
  const range: { lte?: Date; gte?: Date } = {}
  if (minAge !== undefined) {
    range.lte = new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate()))
  }
  if (maxAge !== undefined) {
    // maxAge inclusive: born after (today - (maxAge+1) years).
    range.gte = new Date(
      Date.UTC(now.getUTCFullYear() - maxAge - 1, now.getUTCMonth(), now.getUTCDate() + 1)
    )
  }
  return range
}

export async function resolveAudience(
  gymId: string,
  spec: AudienceSpec
): Promise<ResolvedAudience | { error: string }> {
  let athletes: {
    id: string
    email: string
    firstName: string
    lastName: string
    emailOptOut: boolean
    birthdate: Date | null
  }[] = []
  let label = ''
  let noBirthdate = 0

  if (spec.kind === 'all') {
    label = 'Everyone'
    athletes = await db.athlete.findMany({
      where: { gymId, archived: false },
      select: { id: true, email: true, firstName: true, lastName: true, emailOptOut: true, birthdate: true },
    })
  } else if (spec.kind === 'group') {
    const group = spec.groupId
      ? await db.group.findUnique({ where: { id: spec.groupId } })
      : await db.group.findFirst({
          where: { gymId, name: { equals: spec.groupName ?? '', mode: 'insensitive' } },
        })
    if (!group || group.gymId !== gymId) {
      const available = await db.group.findMany({
        where: { gymId, active: true },
        select: { name: true },
      })
      return {
        error: `No group matched. Groups here: ${available.map((g) => g.name).join(', ') || '(none yet)'}`,
      }
    }
    label = group.name
    const members = await db.groupMember.findMany({
      where: { groupId: group.id },
      include: {
        athlete: {
          select: { id: true, email: true, firstName: true, lastName: true, emailOptOut: true, birthdate: true, archived: true },
        },
      },
    })
    athletes = members.filter((m) => !m.athlete.archived).map((m) => m.athlete)
  } else {
    const { minAge, maxAge } = spec
    label =
      minAge !== undefined && maxAge !== undefined
        ? `Ages ${minAge}–${maxAge}`
        : minAge !== undefined
          ? `Ages ${minAge}+`
          : `Ages up to ${maxAge}`
    const range = ageToBirthdateRange(minAge, maxAge)
    athletes = await db.athlete.findMany({
      where: { gymId, archived: false, birthdate: range },
      select: { id: true, email: true, firstName: true, lastName: true, emailOptOut: true, birthdate: true },
    })
    // Anyone without a birthdate can't be age-filtered; report rather than guess.
    noBirthdate = await db.athlete.count({ where: { gymId, archived: false, birthdate: null } })
  }

  let optedOut = 0
  let badEmail = 0
  const recipients: AudienceRecipient[] = []
  for (const a of athletes) {
    if (a.emailOptOut) {
      optedOut++
      continue
    }
    if (!isDeliverableEmail(a.email)) {
      badEmail++
      continue
    }
    recipients.push({
      athleteId: a.id,
      email: a.email.toLowerCase().trim(),
      firstName: a.firstName,
      lastName: a.lastName,
    })
  }

  return {
    recipients,
    uniqueEmails: new Set(recipients.map((r) => r.email)).size,
    label,
    excluded: { optedOut, badEmail, noBirthdate },
  }
}

export async function createBlastDraft(args: {
  gymId: string
  spec: AudienceSpec
  subject: string
  body: string
  source: 'admin_ui' | 'ai_chat'
  createdById?: string | null
}) {
  const audience = await resolveAudience(args.gymId, args.spec)
  if ('error' in audience) return audience

  const blast = await db.blast.create({
    data: {
      gymId: args.gymId,
      createdById: args.createdById ?? null,
      source: args.source,
      status: 'draft',
      audienceKind: args.spec.kind,
      audienceLabel: audience.label,
      // Frozen at draft time: the count the owner approves is the count sent.
      audienceJson: JSON.stringify(audience.recipients),
      subject: args.subject,
      body: args.body,
      recipientCount: audience.uniqueEmails,
    },
  })

  return { blast, audience }
}

export async function sendBlast(
  blastId: string,
  baseUrl: string
): Promise<{ sent: number; failed: number } | { error: string }> {
  // Atomic claim: two clicks (or two tool calls) can't both send.
  const claimed = await db.blast.updateMany({
    where: { id: blastId, status: 'draft' },
    data: { status: 'sending' },
  })
  if (claimed.count !== 1) {
    return { error: 'That blast has already been sent or discarded.' }
  }

  const blast = await db.blast.findUnique({ where: { id: blastId } })
  if (!blast) return { error: 'Blast not found.' }

  const recipients: AudienceRecipient[] = JSON.parse(blast.audienceJson)

  // One send per mailbox. A parent with three kids in the group gets a single
  // email, and the greeting stays generic in that case.
  const byEmail = new Map<string, AudienceRecipient[]>()
  for (const r of recipients) {
    const list = byEmail.get(r.email) ?? []
    list.push(r)
    byEmail.set(r.email, list)
  }

  let sent = 0
  let failed = 0

  for (const [email, people] of byEmail) {
    // Re-check opt-out at send time: someone who unsubscribed between the
    // draft and the confirmation should still be honoured.
    const stillIn = await db.athlete.findFirst({
      where: { id: { in: people.map((p) => p.athleteId) }, emailOptOut: false, archived: false },
      select: { id: true },
    })
    if (!stillIn) continue

    const logId = await claimBlastSend(blast.gymId, blastId, email)
    if (!logId) continue

    const tpl = buildBlastEmail({
      subject: blast.subject,
      bodyText: blast.body,
      // Unsubscribing is per-athlete; for a shared mailbox we key it to the
      // first athlete on that address.
      unsubscribeUrl: buildUnsubscribeUrl(people[0].athleteId, baseUrl),
      greetingName: people.length === 1 ? people[0].firstName : null,
      logoUrl: process.env.EMAIL_LOGO_URL,
    })

    const { delivered } = await sendEmail({
      to: email,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      headers: {
        'List-Unsubscribe': `<${buildUnsubscribeUrl(people[0].athleteId, baseUrl)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    if (delivered) sent++
    else failed++
    await db.notificationLog.update({
      where: { id: logId },
      data: { status: delivered ? 'sent' : 'failed' },
    })

    // Resend's default rate limit is ~2 requests/second.
    await new Promise((r) => setTimeout(r, 550))
  }

  await db.blast.update({
    where: { id: blastId },
    data: {
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sentCount: sent,
      failedCount: failed,
      sentAt: new Date(),
    },
  })

  return { sent, failed }
}

async function claimBlastSend(gymId: string, blastId: string, email: string) {
  try {
    const row = await db.notificationLog.create({
      data: {
        gymId,
        dedupeKey: `blast:${blastId}:email:${email}`,
        type: 'blast',
        channel: 'email',
        blastId,
        recipient: email,
        status: 'pending',
      },
      select: { id: true },
    })
    return row.id
  } catch {
    return null
  }
}
