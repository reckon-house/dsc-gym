// Email sender. For now this just logs to the server console and returns
// the URL so dev/staging can show it inline. Swap to Resend (or any
// provider) by replacing the body of `sendEmail` and reading RESEND_API_KEY
// from env.

import crypto from 'crypto'

export interface EmailAttachment {
  filename: string
  // Plain-text content; we base64-encode it for Resend's `content` field.
  content: string
  contentType?: string
}

export interface SendEmailArgs {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: EmailAttachment[]
  /** Passed straight to Resend. Used for List-Unsubscribe on blasts. */
  headers?: Record<string, string>
}

export async function sendEmail(args: SendEmailArgs): Promise<{ delivered: boolean }> {
  // Production hook: if RESEND_API_KEY is set, call Resend's API.
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const body: Record<string, unknown> = {
        from: process.env.RESEND_FROM || 'DSC <noreply@dsc.com>',
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      }
      if (args.headers && Object.keys(args.headers).length > 0) {
        body.headers = args.headers
      }
      if (args.attachments && args.attachments.length > 0) {
        body.attachments = args.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, 'utf8').toString('base64'),
          ...(a.contentType ? { content_type: a.contentType } : {}),
        }))
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.text()
        console.error(
          `[email] Resend send FAILED (${res.status}) to=${args.to} subject="${args.subject}":`,
          errBody
        )
        return { delivered: false }
      }
      return { delivered: true }
    } catch (err) {
      console.error(
        `[email] Resend threw for to=${args.to} subject="${args.subject}":`,
        err
      )
      return { delivered: false }
    }
  }

  // No key. In production that is a misconfiguration that would otherwise
  // fail silently — every caller would think mail went out. Shout about it.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[email] RESEND_API_KEY is not set in production — NO EMAIL WAS SENT.',
      { to: args.to, subject: args.subject }
    )
    return { delivered: false }
  }

  // Dev fallback: log so the verification URL is visible in the server output.
  console.log('\n📧 [DEV EMAIL — no RESEND_API_KEY set]')
  console.log(`   To: ${args.to}`)
  console.log(`   Subject: ${args.subject}`)
  console.log(`   ${args.text.replace(/\n/g, '\n   ')}`)
  if (args.attachments?.length) {
    console.log(`   Attachments: ${args.attachments.map((a) => a.filename).join(', ')}`)
  }
  console.log('')
  return { delivered: false }
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export function buildVerificationEmail(args: {
  firstName: string
  url: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = 'Confirm your DSC account'

  const text = `Hi ${args.firstName},

Welcome to Dallas Sport Collective.

Confirm your email to activate your account:
${args.url}

This link expires in 24 hours. If you didn't sign up, ignore this email.

— DSC`

  const html = renderHtmlEmail({
    preview: 'Tap the button to activate your DSC account.',
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: 'Welcome to DSC',
    intro: `Hi ${args.firstName} — you're one tap away from being set up. Confirm your email to activate your account.`,
    buttonLabel: 'Confirm my email',
    buttonUrl: args.url,
    fallbackLabel: 'Or paste this link into your browser:',
    fallbackUrl: args.url,
    footnote: 'This link expires in 24 hours. If you didn’t sign up, you can safely ignore this email.',
  })

  return { subject, text, html }
}

interface EmailLayoutArgs {
  preview: string
  headerLabel: string
  logoUrl?: string
  heroImageUrl?: string
  headline: string
  intro: string
  buttonLabel: string
  buttonUrl: string
  fallbackLabel: string
  fallbackUrl: string
  footnote: string
  /**
   * Pre-rendered HTML slotted between the intro and the button. Callers pass
   * already-escaped markup — used by the digest, whose schedule needs to be a
   * table so the times line up.
   */
  bodyHtml?: string
}

// Email-safe HTML: inline styles, table layout, 600px max width. Uses
// system font stack for cross-client consistency.
function renderHtmlEmail(args: EmailLayoutArgs): string {
  const fontStack =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  const ink = '#0a0a0a'
  const softInk = '#525252'
  const muted = '#9a9a9a'
  const surface = '#f4f4f4'
  const hairline = '#e5e5e5'

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(args.headline)}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:${fontStack};color:${ink};-webkit-font-smoothing:antialiased;">
    <!-- preheader (hidden) -->
    <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${escapeHtml(args.preview)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

            <!-- Brand bar — centered monogram + mono wordmark below -->
            <tr>
              <td align="center" style="padding:8px 8px 28px 8px;">
                ${args.logoUrl ? `
                <img src="${escapeAttr(args.logoUrl)}"
                     alt="DSC"
                     width="64"
                     height="64"
                     style="display:block;width:64px;height:64px;margin:0 auto 12px auto;" />
                ` : `
                <div style="font-family:${fontStack};font-weight:800;font-size:32px;letter-spacing:-0.03em;color:${ink};margin-bottom:8px;">
                  DSC
                </div>
                `}
                <div style="font-family:'SFMono-Regular','Menlo','Monaco',monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${muted};">
                  ${escapeHtml(args.headerLabel)}
                </div>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background:${surface};border-radius:24px;padding:0;overflow:hidden;">

                ${args.heroImageUrl ? `
                <!-- Hero image: edge-to-edge inside the card, rounded top corners -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="line-height:0;font-size:0;">
                      <img src="${escapeAttr(args.heroImageUrl)}"
                           alt="Dallas Sport Collective"
                           width="600"
                           style="display:block;width:100%;max-width:600px;height:auto;border-top-left-radius:24px;border-top-right-radius:24px;" />
                    </td>
                  </tr>
                </table>
                ` : ''}

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:40px 32px 32px 32px;">

                <h1 style="margin:0 0 16px 0;font-family:${fontStack};font-weight:800;font-size:36px;line-height:1;letter-spacing:-0.03em;color:${ink};">
                  ${escapeHtml(args.headline)}
                </h1>

                <p style="margin:0 0 ${args.bodyHtml ? '20px' : '28px'} 0;font-family:${fontStack};font-size:16px;line-height:1.5;color:${softInk};">
                  ${escapeHtml(args.intro)}
                </p>
                ${args.bodyHtml ? `<div style="margin:0 0 28px 0;">${args.bodyHtml}</div>` : ''}

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
                  <tr>
                    <td style="background:${ink};border-radius:9999px;">
                      <a href="${escapeAttr(args.buttonUrl)}"
                         style="display:inline-block;padding:14px 28px;font-family:${fontStack};font-weight:700;font-size:15px;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                        ${escapeHtml(args.buttonLabel)}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 6px 0;font-family:'SFMono-Regular','Menlo','Monaco',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${muted};">
                  ${escapeHtml(args.fallbackLabel)}
                </p>
                <p style="margin:0 0 8px 0;font-family:'SFMono-Regular','Menlo','Monaco',monospace;font-size:12px;line-height:1.5;color:${softInk};word-break:break-all;">
                  <a href="${escapeAttr(args.fallbackUrl)}" style="color:${softInk};text-decoration:underline;">
                    ${escapeHtml(args.fallbackUrl)}
                  </a>
                </p>

                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Footnote -->
            <tr>
              <td style="padding:24px 8px 8px 8px;border-top:1px solid ${hairline};margin-top:24px;">
                <p style="margin:24px 0 0 0;font-family:${fontStack};font-size:12px;line-height:1.5;color:${muted};">
                  ${escapeHtml(args.footnote)}
                </p>
                <p style="margin:8px 0 0 0;font-family:'SFMono-Regular','Menlo','Monaco',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${muted};">
                  Dallas Sport Collective
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// ----- Booking request approval / decline emails -----

export function buildSessionApprovedEmail(args: {
  firstName: string
  trainerName: string
  // Pre-formatted strings — the caller already knows the gym's zone.
  whenHuman: string         // "Wed, May 27, 3:00 PM"
  whenDayDate: string       // "Wednesday, May 27"
  whenTimeRange: string     // "3:00 PM – 4:00 PM"
  durationMinutes: number
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `Confirmed: ${args.whenHuman} with ${args.trainerName.split(' ')[0]}`

  const text = `Hi ${args.firstName},

Your session is confirmed.

${args.whenDayDate}
${args.whenTimeRange} (${args.durationMinutes} min) with ${args.trainerName}

Add it to your calendar using the attached .ics, or see all your upcoming sessions:
${args.dashboardUrl}

— DSC`

  const html = renderHtmlEmail({
    preview: `Confirmed: ${args.whenHuman} with ${args.trainerName.split(' ')[0]}.`,
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: 'You’re booked.',
    intro: `Hi ${args.firstName} — ${args.trainerName} confirmed your session on ${args.whenDayDate} at ${args.whenTimeRange.split(' – ')[0]}. The .ics attached to this email will drop it on your calendar.`,
    buttonLabel: 'See my schedule',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open your dashboard:',
    fallbackUrl: args.dashboardUrl,
    footnote: `If you need to cancel, you can do it from your dashboard or by asking the gym directly. Heads-up — DSC asks for 24h notice on cancellations.`,
  })

  return { subject, text, html }
}

export function buildSessionDeclinedEmail(args: {
  firstName: string
  trainerName: string
  whenHuman: string
  reason: string | null
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `Couldn’t fit ${args.whenHuman}`

  const reasonText = args.reason ? `\n${args.trainerName.split(' ')[0]} said: "${args.reason}"\n` : ''

  const text = `Hi ${args.firstName},

We couldn't fit your requested session at ${args.whenHuman} with ${args.trainerName}.
${reasonText}
Pick another time on your dashboard or ask your AI to find an open slot:
${args.dashboardUrl}

— DSC`

  const html = renderHtmlEmail({
    preview: `Couldn't fit ${args.whenHuman} — try another time.`,
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: 'Let’s find\nanother time.',
    intro:
      `Hi ${args.firstName} — we couldn’t fit ${args.whenHuman} with ${args.trainerName}.` +
      (args.reason ? ` ${args.trainerName.split(' ')[0]} said: “${args.reason}”` : '') +
      ' Hop back on your dashboard to pick another slot, or ask your AI to find one.',
    buttonLabel: 'Find another time',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open your dashboard:',
    fallbackUrl: args.dashboardUrl,
    footnote:
      'No charge for declined requests. The session was never on your account.',
  })

  return { subject, text, html }
}

// Build an RFC 5545 .ics calendar event for an approved session. Returns
// the file contents — pass into sendEmail as an attachment.
export function buildSessionIcs(args: {
  uid: string
  startsAt: Date           // absolute instant
  endsAt: Date             // absolute instant
  trainerName: string
  athleteName: string
  location?: string
  description?: string
}): string {
  const stamp = (d: Date) => {
    // YYYYMMDDTHHMMSSZ in UTC
    const iso = d.toISOString()
    return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  }
  const escapeIcs = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

  // Each line MUST be <= 75 octets; for our content lines this is fine,
  // but if a description ever balloons we'd need to fold. Skipping that
  // complexity since our descriptions are short.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dallas Sport Collective//DSC Gym//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${args.uid}@dsc-gym`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(args.startsAt)}`,
    `DTEND:${stamp(args.endsAt)}`,
    `SUMMARY:${escapeIcs(`Training w/ ${args.trainerName} — DSC`)}`,
    `DESCRIPTION:${escapeIcs(args.description || `${args.athleteName} with ${args.trainerName}`)}`,
    ...(args.location ? [`LOCATION:${escapeIcs(args.location)}`] : []),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Booking + reminder notifications (G1/G2)
// ---------------------------------------------------------------------------

/**
 * Sent when someone other than the athlete puts a session on the calendar —
 * the admin panel, the AI scheduler committing a draft, or a group booking.
 * This is the athlete's first notice of the session, so the caller attaches
 * the .ics alongside it.
 *
 * Trainers get the same email with the roles swapped (`role: 'trainer'`).
 */
export function buildSessionBookedEmail(args: {
  role: 'athlete' | 'trainer'
  firstName: string
  /** The other party: trainer name for athletes, athlete name(s) for trainers. */
  otherPartyName: string
  whenHuman: string
  whenDayDate: string
  whenTimeRange: string
  durationMinutes: number
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const isAthlete = args.role === 'athlete'
  const withWhom = isAthlete
    ? `with ${args.otherPartyName}`
    : `with ${args.otherPartyName}`
  const subject = isAthlete
    ? `You're booked: ${args.whenHuman}`
    : `New session: ${args.whenHuman} — ${args.otherPartyName}`

  const text = `Hi ${args.firstName},

${isAthlete ? 'A session has been added to your schedule.' : 'A session has been added to your calendar.'}

${args.whenDayDate}
${args.whenTimeRange} (${args.durationMinutes} min) ${withWhom}

${args.dashboardUrl}

— DSC`

  const html = renderHtmlEmail({
    preview: `${args.whenDayDate}, ${args.whenTimeRange}`,
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: isAthlete ? "You're booked" : 'New session',
    intro: `Hi ${args.firstName} — ${args.whenDayDate} at ${args.whenTimeRange} (${args.durationMinutes} min) ${withWhom}.`,
    buttonLabel: isAthlete ? 'View my schedule' : 'View my calendar',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.dashboardUrl,
    footnote: isAthlete
      ? 'Need to change it? Reply to this email or talk to your trainer.'
      : 'Added from the DSC scheduler.',
  })

  return { subject, text, html }
}

/**
 * The 24-hour reminder, sent to athlete and trainer alike.
 *
 * Deliberately carries no .ics: the invite went out when the session was
 * booked, and re-sending a METHOD:PUBLISH invite makes some clients create a
 * second calendar entry.
 */
export function buildSessionReminderEmail(args: {
  role: 'athlete' | 'trainer'
  firstName: string
  otherPartyName: string
  whenDayDate: string
  whenTimeRange: string
  durationMinutes: number
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const isAthlete = args.role === 'athlete'
  const startTime = args.whenTimeRange.split(' – ')[0] ?? args.whenTimeRange
  const subject = `Tomorrow at ${startTime}${isAthlete ? '' : ` — ${args.otherPartyName}`}`

  const text = `Hi ${args.firstName},

Reminder — you've got a session tomorrow.

${args.whenDayDate}
${args.whenTimeRange} (${args.durationMinutes} min) with ${args.otherPartyName}

${args.dashboardUrl}

— DSC`

  const html = renderHtmlEmail({
    preview: `Tomorrow, ${args.whenTimeRange}`,
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: 'See you tomorrow',
    intro: `Hi ${args.firstName} — ${args.whenDayDate} at ${args.whenTimeRange} (${args.durationMinutes} min) with ${args.otherPartyName}.`,
    buttonLabel: isAthlete ? 'View my schedule' : 'View my calendar',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.dashboardUrl,
    footnote: 'Reply to this email if you need to move it.',
  })

  return { subject, text, html }
}

/**
 * One digest when a standing slot materializes, instead of N booking emails
 * for N weeks of sessions.
 */
export function buildStandingSlotDigestEmail(args: {
  firstName: string
  trainerName: string
  slotLabel: string // "Tuesdays at 4:00 PM"
  count: number
  throughDate: string // "Oct 24"
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `${args.count} session${args.count === 1 ? '' : 's'} added — ${args.slotLabel}`

  const text = `Hi ${args.firstName},

Your standing slot is booked: ${args.slotLabel} with ${args.trainerName}.

${args.count} session${args.count === 1 ? '' : 's'} added, through ${args.throughDate}.

${args.dashboardUrl}

— DSC`

  const html = renderHtmlEmail({
    preview: `${args.count} sessions added through ${args.throughDate}`,
    headerLabel: 'Dallas Sport Collective',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: 'Your standing slot is set',
    intro: `Hi ${args.firstName} — ${args.slotLabel} with ${args.trainerName}. That's ${args.count} session${args.count === 1 ? '' : 's'} on your schedule through ${args.throughDate}.`,
    buttonLabel: 'View my schedule',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.dashboardUrl,
    footnote: 'Reply to this email if any of these need moving.',
  })

  return { subject, text, html }
}

/**
 * Announcement layout. Plain paragraphs (split on blank lines) rather than one
 * CTA, plus the unsubscribe footer that promotional mail legally needs.
 */
export function buildBlastEmail(args: {
  subject: string
  bodyText: string
  unsubscribeUrl: string
  /** Null for a shared mailbox — greeting stays generic rather than picking a kid. */
  greetingName: string | null
  logoUrl?: string
}): { subject: string; text: string; html: string } {
  const greeting = args.greetingName ? `Hi ${args.greetingName},` : 'Hi,'

  const text = `${greeting}

${args.bodyText}

— Dallas Sport Collective

Unsubscribe from announcements: ${args.unsubscribeUrl}`

  const paragraphs = args.bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Avenir Next,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#141414;">${escapeHtml(
          p
        ).replace(/\n/g, '<br>')}</p>`
    )
    .join('')

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f4;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(args.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
${
  args.logoUrl
    ? `<tr><td align="center" style="padding:28px 32px 8px;"><img src="${escapeAttr(args.logoUrl)}" width="48" height="48" alt="DSC" style="display:block;border:0;"></td></tr>`
    : ''
}
<tr><td style="padding:8px 32px 4px;font-family:'SF Mono',Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8e8e8e;">Dallas Sport Collective</td></tr>
<tr><td style="padding:8px 32px 0;font-family:Avenir Next,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#141414;">${escapeHtml(greeting)}</td></tr>
<tr><td style="padding:16px 32px 8px;">${paragraphs}</td></tr>
<tr><td style="padding:8px 32px 32px;font-family:'SF Mono',Menlo,monospace;font-size:11px;color:#8e8e8e;">
<a href="${escapeAttr(args.unsubscribeUrl)}" style="color:#8e8e8e;">Unsubscribe from announcements</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject: args.subject, text, html }
}

/** Owner-facing: a family wants a spot in an open class. */
export function buildGroupJoinRequestEmail(args: {
  athleteName: string
  groupName: string
  whenHuman: string
  spotsLine: string
  note: string | null
  adminUrl: string
  logoUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `${args.athleteName} wants a spot in ${args.groupName}`
  const intro = `${args.athleteName} asked to join ${args.groupName} (${args.whenHuman}). ${args.spotsLine}${
    args.note ? ` They added: "${args.note}"` : ''
  }`

  const text = `${intro}

Approve or decline: ${args.adminUrl}

— Dallas Sport Collective`

  const html = renderHtmlEmail({
    preview: subject,
    headerLabel: 'Class request',
    logoUrl: args.logoUrl,
    headline: 'Someone wants in',
    intro,
    buttonLabel: 'Review the request',
    buttonUrl: args.adminUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.adminUrl,
    footnote: 'Nothing changes until you approve it.',
  })

  return { subject, text, html }
}

/** Family-facing: they're in, here's when it meets. */
export function buildGroupJoinApprovedEmail(args: {
  firstName: string
  groupName: string
  whenHuman: string
  coachLine: string
  dashboardUrl: string
  logoUrl?: string
  heroImageUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `You're in — ${args.groupName}`
  const intro = `${args.firstName} has a spot in ${args.groupName}. It meets ${args.whenHuman}${args.coachLine}. The sessions are on your schedule now.`

  const text = `${intro}

See your schedule: ${args.dashboardUrl}

— Dallas Sport Collective`

  const html = renderHtmlEmail({
    preview: subject,
    headerLabel: 'Class confirmed',
    logoUrl: args.logoUrl,
    heroImageUrl: args.heroImageUrl,
    headline: "You're in",
    intro,
    buttonLabel: 'See the schedule',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.dashboardUrl,
    footnote: 'Reminders go out the day before each session.',
  })

  return { subject, text, html }
}

/** Family-facing: not this time. */
export function buildGroupJoinDeclinedEmail(args: {
  firstName: string
  groupName: string
  reason: string | null
  dashboardUrl: string
  logoUrl?: string
}): { subject: string; text: string; html: string } {
  const subject = `About ${args.groupName}`
  const intro = args.reason
    ? `We couldn't get ${args.firstName} into ${args.groupName} — ${args.reason}`
    : `We couldn't get ${args.firstName} into ${args.groupName} right now. Get in touch and we'll find something that fits.`

  const text = `${intro}

See what else is open: ${args.dashboardUrl}

— Dallas Sport Collective`

  const html = renderHtmlEmail({
    preview: subject,
    headerLabel: 'Class request',
    logoUrl: args.logoUrl,
    headline: 'Not this one',
    intro,
    buttonLabel: 'See what else is open',
    buttonUrl: args.dashboardUrl,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.dashboardUrl,
    footnote: 'Reply to this email if you want a hand finding a fit.',
  })

  return { subject, text, html }
}

/** The morning digest: one day, in order. */
export function buildDailyDigestEmail(args: {
  firstName: string | null
  dateLabel: string
  lines: { time: string; who: string; detail: string }[]
  url: string
  audience: 'staff' | 'family'
  logoUrl?: string
}): { subject: string; text: string; html: string } {
  const subject =
    args.audience === 'staff'
      ? `Today at DSC — ${args.dateLabel}`
      : `Today's training — ${args.dateLabel}`
  const greeting = args.firstName ? `Morning ${args.firstName},` : 'Morning,'
  const count = args.lines.length
  const intro =
    count === 0
      ? 'Nothing on your schedule today.'
      : args.audience === 'staff'
        ? `${count} thing${count === 1 ? '' : 's'} on your floor today.`
        : `${count} session${count === 1 ? '' : 's'} today.`

  const text = `${greeting}

${intro}

${args.lines.map((l) => `${l.time}  ${l.who} — ${l.detail}`).join('\n')}

Full day: ${args.url}

— Dallas Sport Collective`

  // A table rather than a list: times need to line up to be scannable at 6am.
  const rows = args.lines
    .map(
      (l) => `<tr>
<td style="padding:8px 12px 8px 0;font-family:'SF Mono',Menlo,monospace;font-size:13px;color:#141414;white-space:nowrap;vertical-align:top;">${escapeHtml(l.time)}</td>
<td style="padding:8px 0;font-size:14px;color:#141414;vertical-align:top;"><strong>${escapeHtml(l.who)}</strong><br><span style="font-size:12px;color:#6b6b6b;">${escapeHtml(l.detail)}</span></td>
</tr>`
    )
    .join('')

  const html = renderHtmlEmail({
    preview: `${intro} ${args.dateLabel}`,
    headerLabel: args.dateLabel,
    logoUrl: args.logoUrl,
    headline: args.audience === 'staff' ? 'Your day' : 'Today',
    intro,
    bodyHtml: count
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`
      : undefined,
    buttonLabel: args.audience === 'staff' ? 'Open the day' : 'See the schedule',
    buttonUrl: args.url,
    fallbackLabel: 'Or open this link:',
    fallbackUrl: args.url,
    footnote:
      args.audience === 'staff'
        ? 'Sent each morning. Times are gym-local.'
        : 'Sent each morning. Reply to this email if something looks wrong.',
  })

  return { subject, text, html }
}
