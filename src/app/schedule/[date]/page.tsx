'use client'

// One day of the master schedule: every session with its coaches, roster and
// gym, plus meetings and who's off. Read-only; your own sessions stand out.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { homeFor, useStaff } from '../useStaff'

interface DaySession {
  id: string
  trainerId: string
  scheduledAt: string
  duration: number
  location: string | null
  group?: { name: string } | null
  athlete: { firstName: string; lastName: string } | null
  trainer: { user: { name: string } }
  coaches: { id: string; name: string }[]
  attendees: { id: string; firstName: string; lastName: string }[]
}

interface Meeting {
  id: string
  title: string
  startsAt: string
  duration: number
  trainerIds: string[]
}

interface Off {
  id: string
  trainerName: string
  startMinute: number | null
  label: string
}

function parse(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
function keyOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '')
}

export default function ScheduleDay() {
  const user = useStaff()
  const params = useParams<{ date: string }>()
  const search = useSearchParams()
  const coach = search.get('coach') ?? ''
  const location = search.get('location') ?? ''
  const date = useMemo(() => parse(params.date), [params.date])
  const [sessions, setSessions] = useState<DaySession[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [off, setOff] = useState<Off[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!date) return
    const start = new Date(date)
    const end = new Date(date)
    end.setDate(end.getDate() + 1)
    const qs = new URLSearchParams({ scope: 'all', startDate: start.toISOString(), endDate: end.toISOString() })
    if (coach) qs.set('trainerId', coach)
    if (location) qs.set('location', location)
    const offQs = new URLSearchParams({ scope: 'all', status: 'approved', from: keyOf(date), to: keyOf(date) })
    if (coach) offQs.set('trainerId', coach)
    const [s, m, t] = await Promise.all([
      fetch(`/api/sessions?${qs}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/admin/calendar-events?startDate=${start.toISOString()}&endDate=${end.toISOString()}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/time-off?${offQs}`).then((r) => r.json()).catch(() => null),
    ])
    if (s?.success) setSessions(s.data)
    if (m?.success) {
      const all: Meeting[] = m.data
      setMeetings(coach ? all.filter((e) => e.trainerIds.length === 0 || e.trainerIds.includes(coach)) : all)
    }
    if (t?.success) setOff(t.data)
    setLoading(false)
  }, [date, coach, location])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  if (!date) return null
  const prev = new Date(date)
  prev.setDate(prev.getDate() - 1)
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  const q = search.toString() ? `?${search.toString()}` : ''

  const items = [
    ...sessions.map((s) => ({ kind: 'session' as const, at: s.scheduledAt, s })),
    ...meetings.map((m) => ({ kind: 'meeting' as const, at: m.startsAt, m })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href={`/schedule${q}`}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
          aria-label="Back to week"
        >
          ←
        </Link>
        <div className="dsc-headline text-lg text-black flex-1 truncate">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <Link href={`/schedule/${keyOf(prev)}${q}`} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5" aria-label="Previous day">
          ‹
        </Link>
        <Link href={`/schedule/${keyOf(next)}${q}`} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5" aria-label="Next day">
          ›
        </Link>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-2">
        {(coach || location) && (
          <div className="dsc-label text-black/40">
            Filtered{location ? ` · ${location}` : ''}
            {coach ? ' · one coach' : ''} ·{' '}
            <Link href={`/schedule/${params.date}`} className="underline">
              show everything
            </Link>
          </div>
        )}

        {off.map((o) => (
          <div key={o.id} className="rounded-3xl px-5 py-3 bg-violet-50 text-violet-950">
            <span className="font-semibold">{o.trainerName} is off</span>
            <span className="opacity-70"> · {o.startMinute === null ? 'all day' : o.label.split(', ').pop()}</span>
          </div>
        ))}

        {loading ? (
          <div className="dsc-label text-black/40 py-8 text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center text-sm text-black/60">Nothing on the schedule.</div>
        ) : (
          items.map((item) => {
            if (item.kind === 'meeting') {
              const m = item.m
              return (
                <div key={m.id} className="rounded-3xl p-4 border border-dashed border-black/25 flex gap-4">
                  <div className="font-mono text-sm text-black/50 w-16 shrink-0">{time(m.startsAt)}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-black truncate">{m.title}</div>
                    <div className="dsc-label text-black/40 mt-0.5">
                      Meeting · {m.trainerIds.length === 0 ? 'all staff' : `${m.trainerIds.length} staff`} · {m.duration} min
                    </div>
                  </div>
                </div>
              )
            }
            const s = item.s
            const names = s.coaches.length ? s.coaches.map((c) => c.name) : [s.trainer.user.name]
            const mine = Boolean(user?.trainerId) && s.coaches.some((c) => c.id === user?.trainerId)
            const roster = s.attendees
            const title =
              s.group?.name ?? (roster.length === 1 ? `${roster[0].firstName} ${roster[0].lastName}` : roster.length ? `${roster.length} athletes` : 'Open class')
            return (
              <div key={s.id} className={`rounded-3xl p-4 flex gap-4 ${mine ? 'bg-black text-white' : 'bg-black/[0.04] text-black'}`}>
                <div className={`font-mono text-sm w-16 shrink-0 ${mine ? 'text-white/60' : 'text-black/50'}`}>{time(s.scheduledAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">
                    {title}
                    {mine && <span className="dsc-label ml-2 opacity-60">You</span>}
                  </div>
                  <div className={`dsc-label mt-0.5 ${mine ? 'text-white/60' : 'text-black/40'}`}>
                    {names.join(' & ')} · {s.duration} min{s.location ? ` · ${s.location}` : ''}
                  </div>
                  {roster.length > 1 || (s.group && roster.length > 0) ? (
                    <div className={`text-sm mt-1.5 ${mine ? 'text-white/80' : 'text-black/60'}`}>
                      {roster.map((a) => `${a.firstName} ${a.lastName.charAt(0)}.`).join(', ')}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}

        {user?.role === 'ADMIN' && (
          <Link href={`/admin/calendar/${params.date}`} className="block text-center dsc-label text-black/50 hover:text-black pt-4">
            Edit this day in the admin calendar →
          </Link>
        )}
        <Link href={homeFor(user)} className="block text-center dsc-label text-black/30 hover:text-black pt-2">
          Home
        </Link>
      </div>
    </div>
  )
}
