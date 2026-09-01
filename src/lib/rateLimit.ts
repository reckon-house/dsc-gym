// Fixed-window rate limiting on top of the database.
//
// Why not in memory: on Vercel every function instance starts cold with its
// own memory, so an in-process counter resets constantly and an attacker's
// requests fan out across instances that never compare notes. The count has
// to live somewhere shared. Redis is the usual answer; Neon is the one we
// already have, and for a gym's login form one indexed upsert per attempt is
// indistinguishable. Upstash is the drop-in upgrade if traffic ever warrants.
//
// Why fixed-window: it is the simplest thing that stops what we actually
// worry about — someone hammering /login with `trainer123`, or a script
// creating a thousand athlete accounts and sending a thousand emails. The
// well-known burst-at-the-boundary weakness of fixed windows (2x the limit
// straddling a boundary) is irrelevant at these limits.

import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

export interface RateLimitRule {
  /** Namespace, e.g. 'login'. Keeps buckets for different routes apart. */
  bucket: string
  /** Max requests per window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
}

export interface RateLimitVerdict {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets; only meaningful when !allowed. */
  retryAfterSec: number
}

/**
 * The caller's address as Vercel presents it.
 *
 * x-forwarded-for is set by Vercel's edge and the leftmost entry is the
 * client. Anyone can send the header themselves, but they cannot overwrite
 * what the edge prepends, so taking the first value is the standard and safe
 * choice here. Falls back to a fixed key so a missing header degrades to a
 * single shared bucket rather than to "no limit".
 */
export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/**
 * Count one attempt and say whether it is over the line.
 *
 * Atomic: the upsert's increment is a single statement, so concurrent
 * attempts cannot both read "9" and both proceed as the tenth.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string
): Promise<RateLimitVerdict> {
  const now = Date.now()
  const windowMs = rule.windowSec * 1000
  const windowStart = Math.floor(now / windowMs) * windowMs
  const expiresAt = new Date(windowStart + windowMs)
  const key = `${rule.bucket}:${subject}:${windowStart}`

  try {
    const row = await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    })

    // Housekeeping on roughly one call in fifty. Cheap, and keeps the table
    // from accumulating a row per (ip, minute) forever.
    if (Math.random() < 0.02) {
      void db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => {})
    }

    const remaining = Math.max(0, rule.limit - row.count)
    return {
      allowed: row.count <= rule.limit,
      remaining,
      retryAfterSec: Math.ceil((expiresAt.getTime() - now) / 1000),
    }
  } catch (err) {
    // A limiter that fails closed turns a database hiccup into "nobody can
    // log in". Fail open, but loudly — the log line is the signal.
    console.error('[rateLimit] check failed, allowing request', { key, err })
    return { allowed: true, remaining: rule.limit, retryAfterSec: 0 }
  }
}

/** Standard rules, in one place so they can be reasoned about together. */
export const RULES = {
  /** Staff and athlete sign-in. Generous for humans, hopeless for a script. */
  login: { bucket: 'login', limit: 10, windowSec: 60 } satisfies RateLimitRule,
  /** Account creation. Each one sends an email; a family adds maybe 3 kids. */
  register: { bucket: 'register', limit: 5, windowSec: 600 } satisfies RateLimitRule,
} as const

/** The 429 body, with a Retry-After header the browser and curl both honour. */
export function tooManyRequests(verdict: RateLimitVerdict, what = 'attempts') {
  return new Response(
    JSON.stringify({
      success: false,
      error: `Too many ${what}. Try again in about ${Math.max(1, Math.ceil(verdict.retryAfterSec / 60))} minute${
        verdict.retryAfterSec > 90 ? 's' : ''
      }.`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, verdict.retryAfterSec)),
      },
    }
  )
}
