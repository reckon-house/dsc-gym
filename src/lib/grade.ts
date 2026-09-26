// Sport and grade. Client-safe (no database), shared by the signup form, the
// admin edit sheet and the APIs so they all agree.
//
// Grade is stored as a graduation year. A grade typed in today would be wrong
// every August for every athlete; a graduation year never goes stale. The
// school year is taken to roll over on August 1.

export const SPORTS = [
  'Basketball',
  'Football',
  'Baseball',
  'Softball',
  'Soccer',
  'Volleyball',
  'Track & Field',
  'Lacrosse',
  'Hockey',
  'Tennis',
  'Golf',
  'Wrestling',
  'Swimming',
  'Cheer / Dance',
] as const

export const MAX_SPORTS = 5

/** Grade picker values: K, 1–12, college, adult. */
export const GRADE_OPTIONS: { value: string; label: string }[] = [
  { value: 'K', label: 'Kindergarten' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${ordinal(i + 1)} grade` })),
  { value: 'college', label: 'College' },
  { value: 'adult', label: 'Adult / not in school' },
]

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** The calendar year the current school year ends in (Aug–Jul). */
export function schoolYearEnd(now: Date = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear()
}

/** Picker value → what to store. '' clears it. */
export function gradeToStored(
  value: string,
  now: Date = new Date()
): { ok: true; gradYear: number | null; schoolLevel: string | null } | { ok: false; error: string } {
  const v = (value ?? '').trim()
  if (v === '') return { ok: true, gradYear: null, schoolLevel: null }
  if (v === 'college' || v === 'adult') return { ok: true, gradYear: null, schoolLevel: v }
  const n = v === 'K' ? 0 : Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 12) return { ok: false, error: 'Pick a grade from the list.' }
  return { ok: true, gradYear: schoolYearEnd(now) + (12 - n), schoolLevel: 'k12' }
}

/** Stored → picker value, as of today (so last year's 7th grader reads 8). */
export function storedToGradeValue(gradYear: number | null, schoolLevel: string | null, now: Date = new Date()): string {
  if (schoolLevel === 'college' || schoolLevel === 'adult') return schoolLevel
  if (gradYear === null || gradYear === undefined) return ''
  const g = 12 - (gradYear - schoolYearEnd(now))
  if (g < 0 || g > 12) return ''
  return g === 0 ? 'K' : String(g)
}

/** "8th grade", "Kindergarten", "College", "Class of 2025" once they've graduated. */
export function gradeLabel(gradYear: number | null, schoolLevel: string | null, now: Date = new Date()): string | null {
  if (schoolLevel === 'college') return 'College'
  if (schoolLevel === 'adult') return 'Adult'
  if (gradYear === null || gradYear === undefined) return null
  const g = 12 - (gradYear - schoolYearEnd(now))
  if (g > 12) return `Class of ${gradYear}`
  if (g < 0) return 'Pre-K'
  return g === 0 ? 'Kindergarten' : `${ordinal(g)} grade`
}

/** Clean a sports list from a form: trims, de-dupes, caps length and count. */
export function cleanSports(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const s = raw.trim().slice(0, 40)
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
    if (out.length >= MAX_SPORTS) break
  }
  return out
}
