// Resolves a trainer's bookable minutes on a given date, combining
// weekly availability rules with one-off exceptions (time off / extra hours).

import { db } from '@/lib/db'
import type { Minute, ResolvedAvailability } from './types'
import {
  dayOfWeekInZone,
  endOfDayInZone,
  minutesIntoDayInZone,
  partsInZone,
  startOfDayInZone,
} from './timezone'

interface Interval {
  startMinute: Minute
  endMinute: Minute
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute)
  const merged: Interval[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, cur.endMinute)
    } else {
      merged.push(cur)
    }
  }
  return merged
}

function subtract(base: Interval[], remove: Interval[]): Interval[] {
  let result = base.map((i) => ({ ...i }))
  for (const r of remove) {
    const next: Interval[] = []
    for (const b of result) {
      if (r.endMinute <= b.startMinute || r.startMinute >= b.endMinute) {
        next.push(b)
      } else {
        if (b.startMinute < r.startMinute) {
          next.push({ startMinute: b.startMinute, endMinute: r.startMinute })
        }
        if (r.endMinute < b.endMinute) {
          next.push({ startMinute: r.endMinute, endMinute: b.endMinute })
        }
      }
    }
    result = next
  }
  return result
}

function toYMDInZone(date: Date, zone: string): string {
  const p = partsInZone(date, zone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Until a trainer's availability is configured, assume they can take
// sessions 6am–9pm any day. Once Jordan tells the system a trainer's
// real hours, the row exists and this fallback no longer applies.
const DEFAULT_OPEN: Interval[] = [{ startMinute: 6 * 60, endMinute: 21 * 60 }]

export async function resolveAvailabilityForDate(
  trainerId: string,
  date: Date,
  zone: string
): Promise<ResolvedAvailability> {
  // Day-of-week is in the gym's zone, not the server's.
  const dayOfWeek = dayOfWeekInZone(date, zone)

  // Check if the trainer has ANY availability rows at all.
  const anyRule = await db.trainerAvailability.findFirst({ where: { trainerId } })
  const useDefault = !anyRule

  const weekly = useDefault
    ? []
    : await db.trainerAvailability.findMany({
        where: { trainerId, dayOfWeek },
      })

  // Same for "the day" boundary used to fetch exceptions.
  const dayStart = startOfDayInZone(date, zone)
  const dayEnd = endOfDayInZone(date, zone)

  const exceptions = await db.availabilityException.findMany({
    where: {
      trainerId,
      date: { gte: dayStart, lt: dayEnd },
    },
  })

  let windows: Interval[] = useDefault
    ? DEFAULT_OPEN.map((w) => ({ ...w }))
    : weekly.map((w) => ({
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      }))

  // Extra-hours exceptions (isAvailable=true) add intervals.
  // Time-off exceptions (isAvailable=false) subtract intervals (or full day if null).
  const adds: Interval[] = []
  const removes: Interval[] = []
  for (const ex of exceptions) {
    const range: Interval = {
      startMinute: ex.startMinute ?? 0,
      endMinute: ex.endMinute ?? 24 * 60,
    }
    if (ex.isAvailable) adds.push(range)
    else removes.push(range)
  }

  windows = mergeIntervals([...windows, ...adds])
  windows = subtract(windows, removes)

  return {
    trainerId,
    date: toYMDInZone(date, zone),
    windows,
  }
}

export async function resolveAvailabilityForRange(
  trainerId: string,
  startDate: Date,
  endDate: Date,
  zone: string
): Promise<ResolvedAvailability[]> {
  // Walk zone-local days from startDate's zone-day through endDate's.
  const days: Date[] = []
  let cursor = startOfDayInZone(startDate, zone)
  const finalDay = startOfDayInZone(endDate, zone)
  // Guard against pathological input.
  let safety = 0
  while (cursor.getTime() <= finalDay.getTime() && safety++ < 366) {
    days.push(cursor)
    // Advance one zone-day. Using +25h then snapping back to zone-midnight
    // handles DST transitions cleanly.
    cursor = startOfDayInZone(new Date(cursor.getTime() + 25 * 60 * 60_000), zone)
  }
  return Promise.all(days.map((d) => resolveAvailabilityForDate(trainerId, d, zone)))
}

// DEPRECATED: server-local minutes-into-day. Kept only so older callers
// that don't have a gym zone in scope still type-check. New code should
// use minutesIntoDayInZone from ./timezone.
export function minutesIntoDay(date: Date): Minute {
  return date.getHours() * 60 + date.getMinutes()
}

export { minutesIntoDayInZone }

export function isWithinWindows(
  startMin: Minute,
  endMin: Minute,
  windows: { startMinute: Minute; endMinute: Minute }[]
): boolean {
  return windows.some(
    (w) => startMin >= w.startMinute && endMin <= w.endMinute
  )
}
