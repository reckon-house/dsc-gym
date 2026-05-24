// Resolves a trainer's bookable minutes on a given date, combining
// weekly availability rules with one-off exceptions (time off / extra hours).

import { db } from '@/lib/db'
import type { Minute, ResolvedAvailability } from './types'

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

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Until a trainer's availability is configured, assume they can take
// sessions 6am–9pm any day. Once Jordan tells the system a trainer's
// real hours, the row exists and this fallback no longer applies.
const DEFAULT_OPEN: Interval[] = [{ startMinute: 6 * 60, endMinute: 21 * 60 }]

export async function resolveAvailabilityForDate(
  trainerId: string,
  date: Date
): Promise<ResolvedAvailability> {
  const dayOfWeek = date.getDay()

  // Check if the trainer has ANY availability rows at all.
  const anyRule = await db.trainerAvailability.findFirst({ where: { trainerId } })
  const useDefault = !anyRule

  const weekly = useDefault
    ? []
    : await db.trainerAvailability.findMany({
        where: { trainerId, dayOfWeek },
      })

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const exceptions = await db.availabilityException.findMany({
    where: {
      trainerId,
      date: { gte: dayStart, lte: dayEnd },
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
    date: toYMD(date),
    windows,
  }
}

export async function resolveAvailabilityForRange(
  trainerId: string,
  startDate: Date,
  endDate: Date
): Promise<ResolvedAvailability[]> {
  const days: Date[] = []
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return Promise.all(days.map((d) => resolveAvailabilityForDate(trainerId, d)))
}

export function minutesIntoDay(date: Date): Minute {
  return date.getHours() * 60 + date.getMinutes()
}

export function isWithinWindows(
  startMin: Minute,
  endMin: Minute,
  windows: { startMinute: Minute; endMinute: Minute }[]
): boolean {
  return windows.some(
    (w) => startMin >= w.startMinute && endMin <= w.endMinute
  )
}
