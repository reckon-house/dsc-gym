// Twilio SMS. Mirrors the sendEmail contract: never throws, always resolves
// { delivered }, and logs loudly on failure.
//
// This ships dormant on purpose. US carriers filter application-to-person
// traffic that isn't registered under A2P 10DLC, and that registration takes
// weeks. Until TWILIO_* is set in the environment, sendSms is a no-op that
// reports itself — every caller stays email-only with no code change, and
// turning SMS on later is three env vars and zero deploys.

const API_ROOT = 'https://api.twilio.com/2010-04-01'

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
  )
}

export interface SendSmsArgs {
  /** E.164, e.g. +12145550123. Athlete.phone is already stored normalized. */
  to: string
  body: string
}

export type SendSmsResult = {
  delivered: boolean
  skipped?: 'not-configured' | 'error'
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  if (!smsConfigured()) {
    // Expected state until A2P registration clears — warn, don't error.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[sms] TWILIO_* not configured — SMS skipped', { to: args.to })
    }
    return { delivered: false, skipped: 'not-configured' }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!

  const form = new URLSearchParams({ To: args.to, Body: args.body })
  // A Messaging Service is preferred: the A2P campaign binds to it, and Twilio
  // handles STOP/HELP suppression on its side.
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
  } else {
    form.set('From', process.env.TWILIO_FROM_NUMBER!)
  }

  try {
    const res = await fetch(`${API_ROOT}/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[sms] Twilio send FAILED (${res.status}) to=${args.to}:`, errBody)
      return { delivered: false, skipped: 'error' }
    }
    return { delivered: true }
  } catch (err) {
    console.error(`[sms] Twilio threw for to=${args.to}:`, err)
    return { delivered: false, skipped: 'error' }
  }
}
