// Pull a name, email and phone out of whatever someone typed into the signup
// box: "Justin Jefferson, jjefferson@gmail.com, 214-697-4578".
//
// This used to be a Claude call on a public, unauthenticated endpoint. Anyone
// on the internet could POST to it and burn tokens indefinitely, and every
// legitimate signup paid ~1s of latency for a job that is three regexes. The
// output shape is kept identical to what the model returned so the form does
// not know the difference.

import { normalizePhone } from '@/lib/phone'

export interface ParsedRegistration {
  firstName: string
  lastName: string
  email: string
  phone?: string
  /** 0–1. The form uses this to decide whether to ask the user to confirm. */
  confidence: number
  clarificationNeeded?: string
}

// Deliberately permissive: the goal is to find the one thing that looks like
// an address, not to validate it. The register route validates for real.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

// Anything with 10-11 digits once punctuation is ignored. normalizePhone
// decides whether it is actually a US mobile number.
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/

export function parseRegistrationText(raw: string): ParsedRegistration {
  const text = raw.replace(/\s+/g, ' ').trim()

  const emailMatch = text.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0].toLowerCase() : ''

  const phoneMatch = text.match(PHONE_RE)
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) ?? undefined : undefined

  // Whatever is left once the structured bits are gone is the name.
  let rest = text
  if (emailMatch) rest = rest.replace(emailMatch[0], ' ')
  if (phoneMatch) rest = rest.replace(phoneMatch[0], ' ')
  const nameTokens = rest
    .replace(/[,;|/]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t && !/^(and|&|-|–)$/i.test(t))
    // Drop stray labels people type: "name:", "email", "phone".
    .filter((t) => !/^(name|email|e-mail|phone|cell|mobile|tel)[:]?$/i.test(t))

  const firstName = nameTokens[0] ? titleCase(nameTokens[0]) : ''
  const lastName = nameTokens.length > 1 ? nameTokens.slice(1).map(titleCase).join(' ') : ''

  // Confidence is a plain function of what was found. The model used to make
  // this up; a rule is at least consistent.
  let confidence = 0
  let clarificationNeeded: string | undefined
  if (email) confidence += 0.4
  if (firstName && lastName) confidence += 0.4
  else if (firstName) confidence += 0.2
  if (phone) confidence += 0.15
  else if (phoneMatch) confidence += 0.05 // digits present but not a valid US mobile

  if (!email) clarificationNeeded = 'I could not find an email address.'
  else if (!firstName) clarificationNeeded = 'I found the email but not a name.'
  else if (!lastName) clarificationNeeded = `Is "${firstName}" the first name? I did not see a last name.`
  else if (!phone && phoneMatch) clarificationNeeded = 'That phone number does not look like a 10-digit US mobile.'

  return {
    firstName,
    lastName,
    email,
    phone,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    clarificationNeeded,
  }
}

function titleCase(s: string): string {
  // Preserve intentional capitalisation ("McDonald", "DeShawn"); only lift a
  // fully lowercase token.
  if (s !== s.toLowerCase()) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
