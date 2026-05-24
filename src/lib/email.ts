// Email sender. For now this just logs to the server console and returns
// the URL so dev/staging can show it inline. Swap to Resend (or any
// provider) by replacing the body of `sendEmail` and reading RESEND_API_KEY
// from env.

import crypto from 'crypto'

export interface SendEmailArgs {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<{ delivered: boolean }> {
  // Production hook: if RESEND_API_KEY is set, call Resend's API.
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'DSC <noreply@dsc.com>',
          to: args.to,
          subject: args.subject,
          text: args.text,
          html: args.html,
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('Resend send failed:', body)
        return { delivered: false }
      }
      return { delivered: true }
    } catch (err) {
      console.error('Resend exception:', err)
      return { delivered: false }
    }
  }

  // Dev fallback: log so the verification URL is visible in the server output.
  console.log('\n📧 [DEV EMAIL — no RESEND_API_KEY set]')
  console.log(`   To: ${args.to}`)
  console.log(`   Subject: ${args.subject}`)
  console.log(`   ${args.text.replace(/\n/g, '\n   ')}`)
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
}): { subject: string; text: string; html: string } {
  const subject = 'Confirm your DSC account'

  const text = `Hi ${args.firstName},

Welcome to Dallas Sports Collective.

Confirm your email to activate your account:
${args.url}

This link expires in 24 hours. If you didn't sign up, ignore this email.

— DSC`

  const html = renderHtmlEmail({
    preview: 'Tap the button to activate your DSC account.',
    headerLabel: 'Dallas Sports Collective',
    logoUrl: args.logoUrl,
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
  headline: string
  intro: string
  buttonLabel: string
  buttonUrl: string
  fallbackLabel: string
  fallbackUrl: string
  footnote: string
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

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:40px 32px 32px 32px;">

                <h1 style="margin:0 0 16px 0;font-family:${fontStack};font-weight:800;font-size:36px;line-height:1;letter-spacing:-0.03em;color:${ink};">
                  ${escapeHtml(args.headline)}
                </h1>

                <p style="margin:0 0 28px 0;font-family:${fontStack};font-size:16px;line-height:1.5;color:${softInk};">
                  ${escapeHtml(args.intro)}
                </p>

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
                  Dallas Sports Collective
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
