// Light-touch US/Canada phone handling. We don't pull in libphonenumber —
// the athlete base is high-school / college kids in Dallas, so the
// space we care about is 10-digit US numbers (with optional leading 1).
//
// Storage: E.164 (+1XXXXXXXXXX). Display: (XXX) XXX-XXXX.

export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D+/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function formatPhonePretty(stored: string | null | undefined): string {
  if (!stored) return ''
  const digits = stored.replace(/\D+/g, '')
  const tenDigits = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits
  if (tenDigits.length !== 10) return stored
  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`
}

// `sms:` works on iOS/Android; tel: works everywhere.
export function smsHref(stored: string | null | undefined): string | null {
  if (!stored) return null
  return `sms:${stored}`
}

export function telHref(stored: string | null | undefined): string | null {
  if (!stored) return null
  return `tel:${stored}`
}
