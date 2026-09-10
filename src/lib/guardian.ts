// Who counts as a minor, and what a minor's signup must carry.
//
// Shared by the form and the API on purpose. The form uses it to decide which
// fields to show; the API uses it to decide what to reject. If only the form
// knew the rule, anyone posting straight to the endpoint could skip it.

/** Age in whole years on a given day, in local terms. */
export function ageOn(birthdate: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - birthdate.getUTCFullYear()
  const monthDiff = on.getMonth() - birthdate.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < birthdate.getUTCDate())) age--
  return age
}

export const MINOR_AGE = 18

export function isMinor(birthdate: Date, on: Date = new Date()): boolean {
  return ageOn(birthdate, on) < MINOR_AGE
}

/**
 * Parse a YYYY-MM-DD birthdate as UTC midnight.
 *
 * Parsed as UTC so the stored DATE cannot drift a day either way depending on
 * where the server happens to be — the same reason the athlete PATCH route
 * does it this way.
 */
export function parseBirthdate(raw: string): Date | null {
  const value = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  // Guard against typos that would otherwise sail through: a birthdate in the
  // future, or one implying an implausible age.
  const age = ageOn(parsed)
  if (age < 0 || age > 120) return null
  return parsed
}

export interface GuardianInput {
  parentName?: string
  parentPhone?: string
  parentRelationship?: string
  emergencyName?: string
  emergencyPhone?: string
  emergencyRelationship?: string
  /** The form's "emergency contact is the same as the parent" checkbox. */
  emergencySameAsParent?: boolean
}

export interface GuardianFields {
  parentName: string | null
  parentPhone: string | null
  parentRelationship: string | null
  emergencyName: string | null
  emergencyPhone: string | null
  emergencyRelationship: string | null
}

/**
 * Validate and normalise the guardian block.
 *
 * `normalizePhone` is passed in rather than imported so this module stays
 * usable from the client bundle without dragging server code with it.
 *
 * "Same as parent" COPIES the parent's details rather than recording a flag —
 * see the schema comment. The copy happens here, once, so the form and the API
 * cannot disagree about what was meant.
 */
export function resolveGuardian(
  input: GuardianInput,
  minor: boolean,
  normalizePhone: (raw: string) => string | null
): { ok: true; fields: GuardianFields } | { ok: false; error: string } {
  const parentName = (input.parentName ?? '').trim()
  const parentRelationship = (input.parentRelationship ?? '').trim()
  const rawParentPhone = (input.parentPhone ?? '').trim()

  if (minor) {
    if (!parentName) {
      return { ok: false, error: 'A parent or guardian name is required for an athlete under 18.' }
    }
    if (!rawParentPhone) {
      return { ok: false, error: "A parent or guardian's mobile number is required." }
    }
  }

  let parentPhone: string | null = null
  if (rawParentPhone) {
    parentPhone = normalizePhone(rawParentPhone)
    if (!parentPhone) {
      return {
        ok: false,
        error: "Enter a 10-digit US number for the parent or guardian (e.g. 214-555-0123).",
      }
    }
  }

  const same = Boolean(input.emergencySameAsParent)
  const emergencyName = same ? parentName : (input.emergencyName ?? '').trim()
  const rawEmergencyPhone = same ? rawParentPhone : (input.emergencyPhone ?? '').trim()
  const emergencyRelationship = same
    ? parentRelationship
    : (input.emergencyRelationship ?? '').trim()

  if (minor) {
    if (!emergencyName) {
      return { ok: false, error: 'An emergency contact name is required.' }
    }
    if (!rawEmergencyPhone) {
      return { ok: false, error: "An emergency contact's mobile number is required." }
    }
  }

  let emergencyPhone: string | null = null
  if (rawEmergencyPhone) {
    emergencyPhone = same
      ? parentPhone
      : normalizePhone(rawEmergencyPhone)
    if (!emergencyPhone) {
      return {
        ok: false,
        error: 'Enter a 10-digit US number for the emergency contact (e.g. 214-555-0123).',
      }
    }
  }

  return {
    ok: true,
    fields: {
      parentName: parentName || null,
      parentPhone,
      parentRelationship: parentRelationship || null,
      emergencyName: emergencyName || null,
      emergencyPhone,
      emergencyRelationship: emergencyRelationship || null,
    },
  }
}
