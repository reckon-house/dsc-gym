// Daily reminder job: emails tomorrow's sessions to both the athlete and the
// trainer.
//
// Auth: Vercel attaches `Authorization: Bearer $CRON_SECRET` to cron
// invocations whenever that env var exists, so the same check covers the real
// schedule and a manual curl. This path is in middleware's PUBLIC_PATHS
// because Vercel's cron caller has no session cookie — it authenticates here
// instead, not by being unprotected.
//
// Safe to run more than once: every send is claimed against NotificationLog's
// unique dedupeKey first, so a re-run reports `alreadySent` and mails nobody.

import { NextRequest, NextResponse } from 'next/server'
import { sendDueReminders } from '@/lib/notify'
import { sendDailyDigest } from '@/lib/digest'
import { DEFAULT_GYM_ID } from '@/lib/constants'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run')
    return NextResponse.json(
      { success: false, error: 'Cron is not configured.' },
      { status: 503 }
    )
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // One invocation does both the day-ahead reminders and this morning's
  // digest. Kept on a single schedule rather than a second cron entry so the
  // job cannot half-exist on a plan with a cron limit — and so there is one
  // place to look when someone asks what the 6am mail run did.
  const now = new Date()
  const out: Record<string, unknown> = {}
  let failed = false

  try {
    out.reminders = await sendDueReminders(now)
  } catch (err) {
    failed = true
    out.reminders = { error: 'Reminder run failed' }
    console.error('[cron] reminder run failed', err)
  }

  // Independently guarded: a digest failure must not cost anyone their
  // session reminder, and vice versa.
  try {
    out.digest = await sendDailyDigest(DEFAULT_GYM_ID, now)
  } catch (err) {
    failed = true
    out.digest = { error: 'Digest run failed' }
    console.error('[cron] digest run failed', err)
  }

  console.log('[cron] morning run', JSON.stringify(out))
  return NextResponse.json({ success: !failed, ...out }, { status: failed ? 500 : 200 })
}
