// Timezone helpers. The DB stores absolute instants (Date = UTC), but
// availability windows and "what day is this booking on" are concepts
// in the gym's *local* timezone. On Vercel, server local time = UTC,
// so calling `date.getHours()` directly was producing wrong answers
// (e.g. treating 3pm Central as 8pm). These helpers route everything
// through Intl.DateTimeFormat so the math is always in the gym's zone.

const WEEKDAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

interface ZonedParts {
  year: number
  month: number  // 1-12
  day: number    // 1-31
  hour: number   // 0-23
  minute: number // 0-59
  second: number
  weekday: number // 0=Sun, 6=Sat (matches Date.getDay())
}

// Decompose an instant into the wall-clock fields for a target zone.
export function partsInZone(date: Date, zone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  // 24-hour formatters sometimes emit "24" for midnight — normalize.
  const hour = parseInt(map.hour, 10) % 24
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: WEEKDAY[map.weekday] ?? 0,
  }
}

export function dayOfWeekInZone(date: Date, zone: string): number {
  return partsInZone(date, zone).weekday
}

export function minutesIntoDayInZone(date: Date, zone: string): number {
  const p = partsInZone(date, zone)
  return p.hour * 60 + p.minute
}

// Offset, in minutes, between UTC and the given zone at the given instant.
// e.g. America/Chicago in May → -300 (CDT is UTC-5).
function offsetMinutes(instant: Date, zone: string): number {
  const p = partsInZone(instant, zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return (asUtc - instant.getTime()) / 60_000
}

// The instant that, when displayed in the zone, reads as midnight of the
// (year, month, day) that `reference` falls on in that zone.
export function startOfDayInZone(reference: Date, zone: string): Date {
  const { year, month, day } = partsInZone(reference, zone)
  // First approximation: treat zone-local midnight as if it were UTC.
  const provisional = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  // Now figure out the zone's offset *at that instant* and shift to land
  // on real zone-midnight. Done twice in case the first shift crossed a
  // DST boundary.
  const off1 = offsetMinutes(provisional, zone)
  const pass1 = new Date(provisional.getTime() - off1 * 60_000)
  const off2 = offsetMinutes(pass1, zone)
  return new Date(provisional.getTime() - off2 * 60_000)
}

export function endOfDayInZone(reference: Date, zone: string): Date {
  const start = startOfDayInZone(reference, zone)
  return new Date(start.getTime() + 24 * 60 * 60 * 1000)
}

// Parse YYYY-MM-DD as zone-midnight, not server-local midnight.
// We anchor at noon UTC of that date so that even with ±14h offsets the
// reference falls inside the intended calendar day in the target zone —
// then startOfDayInZone snaps to that day's midnight.
export function dateOnlyInZone(ymd: string, zone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const reference = new Date(
    Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 12)
  )
  return startOfDayInZone(reference, zone)
}

export function formatInZone(
  date: Date,
  zone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone }).format(date)
}

// Convenience: "Wed May 27, 3:00 PM"
export function formatHuman(date: Date, zone: string): string {
  return formatInZone(date, zone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Convenience: "3:00 PM"
export function formatTime(date: Date, zone: string): string {
  return formatInZone(date, zone, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "HH:MM" 24-hour from minutes-into-day. Just formatting, no zone math.
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
