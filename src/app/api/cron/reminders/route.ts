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

  try {
    const report = await sendDueReminders(new Date())
    // Returned as JSON so the run shows up readably in Vercel's cron log —
    // including which people were skipped for an undeliverable address.
    console.log('[cron] reminder run', report)
    return NextResponse.json({ success: true, ...report })
  } catch (err) {
    console.error('[cron] reminder run failed', err)
    return NextResponse.json(
      { success: false, error: 'Reminder run failed' },
      { status: 500 }
    )
  }
}
