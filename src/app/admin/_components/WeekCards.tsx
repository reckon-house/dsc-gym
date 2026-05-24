'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'

export interface CardSession {
  id: string
  scheduledAt: string
  athleteName: string
  trainerName: string
  duration: number
  cancelled?: boolean
}

interface Props {
  weekStart: Date
  sessions: CardSession[]
  hrefFor: (date: Date) => string // e.g., date => `/admin/calendar/${dateKey(date)}`
  onWeekChange: (start: Date) => void
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function shiftWeek(d: Date, weeks: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + weeks * 7)
  return out
}

function fmtTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')
}

export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function WeekCards({ weekStart, sessions, hrefFor, onWeekChange }: Props) {
  useEffect(() => {
    const aligned = startOfWeek(weekStart)
    if (aligned.getTime() !== weekStart.getTime()) onWeekChange(aligned)
  }, [weekStart, onWeekChange])

  const days = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      out.push(d)
    }
    return out
  }, [weekStart])

  const byDay = useMemo(() => {
    const map: Record<string, CardSession[]> = {}
    for (const s of sessions) {
      const key = new Date(s.scheduledAt).toDateString()
      ;(map[key] ??= []).push(s)
    }
    for (const k of Object.keys(map)) {
      map[k].sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    }
    return map
  }, [sessions])

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const todayKey = new Date().toDateString()

  return (
    <div>
      {/* Week navigation */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
          aria-label="Previous week"
        >
          ←
        </button>
        <div className="flex items-baseline gap-2">
          <span className="dsc-label text-black/40">Week of</span>
          <span className="text-sm md:text-base font-bold tracking-tight text-black">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
            {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onWeekChange(startOfWeek(new Date()))}
            className="dsc-label text-black/60 hover:text-black px-2 py-1"
          >
            Today
          </button>
          <button
            onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>

      {/* Day cards — 2-col grid; today spans full width to stay prominent. */}
      <div className="px-4 pb-6 grid grid-cols-2 gap-3">
        {days.map((d) => {
          const key = d.toDateString()
          const list = byDay[key] ?? []
          const isToday = key === todayKey
          const count = list.length
          // Smaller cards = tighter preview. Today spans full width so it
          // can still show more.
          const previewLimit = isToday ? 3 : 2
          const preview = list.slice(0, previewLimit)
          const more = Math.max(0, count - preview.length)

          return (
            <Link
              key={key}
              href={hrefFor(d)}
              className={`block rounded-3xl p-4 md:p-5 transition-colors ${
                isToday ? 'col-span-2' : ''
              } ${
                isToday
                  ? 'bg-black text-white hover:bg-black/90'
                  : 'bg-black/[0.04] hover:bg-black/[0.07] text-black'
              }`}
            >
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div
                    className={`dsc-label ${isToday ? 'text-white/60' : 'text-black/50'}`}
                  >
                    {DAY_NAMES[d.getDay()]}
                  </div>
                  <div
                    className={`dsc-headline leading-none mt-1 ${
                      isToday ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl'
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`dsc-headline leading-none ${
                      isToday ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                    }`}
                  >
                    {count > 0 ? count : '—'}
                  </div>
                  {count > 0 && (
                    <div
                      className={`dsc-label mt-1 ${isToday ? 'text-white/60' : 'text-black/50'}`}
                    >
                      {count === 1 ? 'session' : 'sessions'}
                    </div>
                  )}
                </div>
              </div>

              {count > 0 && (
                <div className="space-y-1.5">
                  {preview.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded-2xl px-3 py-1.5 flex items-baseline justify-between gap-2 ${
                        isToday ? 'bg-white text-black' : 'bg-black text-white'
                      } ${s.cancelled ? 'opacity-40 line-through' : ''}`}
                    >
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-[10px] opacity-75 shrink-0">
                          {fmtTime(s.scheduledAt)}
                        </span>
                        <span className="font-semibold text-xs truncate">
                          {s.athleteName}
                        </span>
                      </div>
                      <span className="dsc-label opacity-60 shrink-0 text-[10px]">
                        {s.trainerName.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                  {more > 0 && (
                    <div
                      className={`dsc-label text-center pt-1 ${
                        isToday ? 'text-white/70' : 'text-black/50'
                      }`}
                    >
                      + {more} more
                    </div>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
