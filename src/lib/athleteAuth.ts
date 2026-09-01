// Family accounts.
//
// One parent email covers several kids. There is no Family table: the set of
// athletes sharing a normalized email IS the family. That keeps registration,
// verification and OAuth on their existing paths instead of rewriting them
// around a new account entity.
//
// The rule that makes it safe: credentials are family-wide. Password and
// verification state live on every sibling row, so they can never drift.
// Nothing outside this module should write passwordHash or emailVerified.

import { db } from '@/lib/db'
import { normalizePhone } from '@/lib/phone'

export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim()
}

/**
 * Everyone who signs in with this identifier (an email or a phone number),
 * oldest first — the oldest is the default active athlete.
 */
export async function findLoginGroup(identifier: string) {
  const raw = identifier.trim()
  const where = raw.includes('@')
    ? { email: normalizeEmail(raw) }
    : (() => {
        const phone = normalizePhone(raw)
        return phone ? { phone } : null
      })()
  if (!where) return []

  return db.athlete.findMany({
    where: { ...where, archived: false },
    orderBy: { createdAt: 'asc' },
  })
}

/** All siblings on an athlete's mailbox, including the athlete. */
export async function findFamilyByEmail(email: string) {
  return db.athlete.findMany({
    where: { email: normalizeEmail(email), archived: false },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Set the password for a whole family at once.
 *
 * If this ever became a single-row update, siblings would drift: one kid's row
 * would hold the new hash and the rest the old one, and which password worked
 * would depend on which row login happened to pick first.
 */
export async function setFamilyPassword(email: string, passwordHash: string) {
  return db.athlete.updateMany({
    where: { email: normalizeEmail(email) },
    data: { passwordHash },
  })
}

/** Verifying one sibling's link verifies the whole family — same mailbox. */
export async function markFamilyVerified(email: string) {
  return db.athlete.updateMany({
    where: { email: normalizeEmail(email) },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  })
}

/**
 * The signed-in family, read from the athleteSession cookie.
 *
 * `activeId` is the kid currently being viewed; `athleteIds` is everyone on
 * that login. Anything family-wide (browsing classes, join requests) should use
 * the full list, or a parent with two kids sees the schedule twice over.
 */
export async function readAthleteSession(): Promise<
  { activeId: string; athleteIds: string[] } | null
> {
  const { cookies } = await import('next/headers')
  const { jwtVerify } = await import('jose')
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-change-in-production'
  )

  const token = (await cookies()).get('athleteSession')?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret)
    if (payload.role !== 'ATHLETE' || !payload.athleteId) return null
    const activeId = payload.athleteId as string
    // Cookies issued before family accounts shipped carry no athleteIds; fall
    // back to the single athlete rather than refusing a still-valid login.
    const ids = Array.isArray(payload.athleteIds)
      ? (payload.athleteIds as string[])
      : [activeId]
    return { activeId, athleteIds: ids.length ? ids : [activeId] }
  } catch {
    return null
  }
}
