// Waiver signing links, for athletes who never went through the signup form.
//
// When a coach or admin creates a profile (the admin form, or "add Maya" in the
// chat), nobody agrees to the waiver — there is no one there to agree. Those
// profiles showed "Waiver pending" forever. This gives staff a way to close
// that: generate a one-time link, email or text it to the family, and the
// signature lands on that athlete.
//
// The link is bound to one athlete by a random token, and only its SHA-256 is
// stored, so a database read does not hand out signable links. It expires,
// it is single use, and generating a new one invalidates the old.

import crypto from 'crypto'
import { db } from '@/lib/db'
import { buildWaiverRequestEmail, sendEmail } from '@/lib/email'
import { isDeliverableEmail } from '@/lib/notify'
import { publicBaseUrl } from '@/lib/oauth/util'

export const WAIVER_LINK_DAYS = 14

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export interface WaiverLinkResult {
  url: string
  expiresAt: Date
  /** Whether an email actually went out. False for placeholder addresses. */
  emailed: boolean
  emailedTo: string | null
}

/**
 * Make a fresh signing link for one athlete, optionally emailing it.
 * Any earlier link for the same athlete stops working.
 */
export async function createWaiverLink(
  athleteId: string,
  opts: { send: boolean; origin?: string | null }
): Promise<WaiverLinkResult | { error: string }> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, firstName: true, email: true, archived: true, waiverSignedAt: true },
  })
  if (!athlete) return { error: 'Athlete not found.' }
  if (athlete.archived) return { error: 'That athlete is archived.' }
  if (athlete.waiverSignedAt) return { error: `${athlete.firstName}'s waiver is already signed.` }

  const token = crypto.randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + WAIVER_LINK_DAYS * 86400_000)
  const url = `${publicBaseUrl(opts.origin)}/waiver/${token}`

  const deliverable = isDeliverableEmail(athlete.email)
  let emailed = false
  if (opts.send && deliverable) {
    const msg = buildWaiverRequestEmail({ firstName: athlete.firstName, url, days: WAIVER_LINK_DAYS })
    emailed = (await sendEmail({ to: athlete.email, ...msg })).delivered
  }

  await db.athlete.update({
    where: { id: athlete.id },
    data: {
      waiverTokenHash: hash(token),
      waiverTokenExpiresAt: expiresAt,
      ...(emailed ? { waiverLinkSentAt: new Date() } : {}),
    },
  })

  return { url, expiresAt, emailed, emailedTo: emailed ? athlete.email : null }
}

type Lookup =
  | { ok: true; athlete: { id: string; gymId: string; firstName: string; lastName: string; email: string } }
  | { ok: false; reason: 'invalid' | 'expired' | 'signed' }

export async function findByWaiverToken(token: string): Promise<Lookup> {
  if (!token || token.length > 100) return { ok: false, reason: 'invalid' }
  const athlete = await db.athlete.findUnique({
    where: { waiverTokenHash: hash(token) },
    select: {
      id: true,
      gymId: true,
      firstName: true,
      lastName: true,
      email: true,
      archived: true,
      waiverSignedAt: true,
      waiverTokenExpiresAt: true,
    },
  })
  if (!athlete || athlete.archived) return { ok: false, reason: 'invalid' }
  if (athlete.waiverSignedAt) return { ok: false, reason: 'signed' }
  if (!athlete.waiverTokenExpiresAt || athlete.waiverTokenExpiresAt < new Date()) {
    return { ok: false, reason: 'expired' }
  }
  const { id, gymId, firstName, lastName, email } = athlete
  return { ok: true, athlete: { id, gymId, firstName, lastName, email } }
}

/**
 * Record the signature and burn the token, together. The conditional update
 * is what makes the link single-use: two tabs submitting at once cannot both
 * find the token still there.
 */
export async function signWithToken(
  token: string,
  legalName: string,
  ipAddress: string
): Promise<{ ok: true; firstName: string } | { ok: false; error: string }> {
  const found = await findByWaiverToken(token)
  if (!found.ok) {
    return {
      ok: false,
      error:
        found.reason === 'signed'
          ? 'This waiver has already been signed.'
          : found.reason === 'expired'
            ? 'This link has expired. Ask the gym to send a new one.'
            : 'This link is not valid. Ask the gym to send a new one.',
    }
  }
  const { athlete } = found
  const signedAt = new Date()

  const burned = await db.athlete.updateMany({
    where: { id: athlete.id, waiverTokenHash: hash(token), waiverSignedAt: null },
    data: { waiverSignedAt: signedAt, waiverTokenHash: null, waiverTokenExpiresAt: null },
  })
  if (burned.count === 0) return { ok: false, error: 'This waiver has already been signed.' }

  await db.waiverSignature.create({
    data: {
      gymId: athlete.gymId,
      email: athlete.email.toLowerCase(),
      legalName,
      ipAddress,
      athleteId: athlete.id,
      signedAt,
    },
  })
  return { ok: true, firstName: athlete.firstName }
}
