'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  SessionEditSheet,
  type SessionDraft,
} from '../../_components/SessionEditSheet'

interface DaySession {
  id: string
  trainerId: string
  athleteId: string
  scheduledAt: string
  duration: number
  cancelled: boolean
  completed: boolean
  athlete: { firstName: string; lastName: string }
  trainer: { id: string; user: { name: string } }
  attendees?: { id: string; firstName: string; lastName: string }[]
}

interface TrainerOpt {
  id: string
  user: { name: string }
}

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
  trainerId: string | null
}

function fmtTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')
}

function parseDateKey(key: string): Date | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CalendarDayDetail() {
  const router = useRouter()
  const params = useParams<{ date: string }>()
  const date = parseDateKey(params.date)
  const [sessions, setSessions] = useState<DaySession[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<SessionDraft | null>(null)

  const loadSessions = useCallback(async () => {
    if (!date) return
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const res = await fetch(
      `/api/sessions?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    )
    const data = await res.json()
    if (data.success) setSessions(data.data)
  }, [date])

  const loadOptions = useCallback(async () => {
    const [t, a] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/athletes').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (a.success) {
      setAthletes(
        a.data.map(
          (row: {
            id: string
            firstName: string
            lastName: string
            trainerId: string | null
          }) => ({
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            trainerId: row.trainerId,
          })
        )
      )
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  useEffect(() => {
    loadSessions()
    loadOptions()
  }, [loadSessions, loadOptions])

  const prevDay = useMemo(() => {
    if (!date) return null
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    return d
  }, [date])

  const nextDay = useMemo(() => {
    if (!date) return null
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    return d
  }, [date])

  function handleTap(session: DaySession) {
    setDraft({
      id: session.id,
      trainerId: session.trainerId,
      athleteId: session.athleteId,
      scheduledAt: session.scheduledAt,
      duration: session.duration,
      attendees: session.attendees,
    })
    setSheetOpen(true)
  }

  function handleAdd() {
    if (!date) return
    const at = new Date(date)
    at.setHours(9, 0, 0, 0)
    setDraft({ scheduledAt: at.toISOString(), duration: 60 })
    setSheetOpen(true)
  }

  if (!date) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="dsc-label text-black/40 mb-2">Bad date</div>
          <h2 className="dsc-headline text-2xl text-black mb-4">
            Couldn&rsquo;t parse that day
          </h2>
          <Link
            href="/admin/calendar"
            className="inline-block px-5 py-2 bg-black text-white rounded-full font-semibold"
          >
            Back to calendar
          </Link>
        </div>
      </div>
    )
  }

  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href="/admin/calendar"
          aria-label="Back to calendar"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <Link href="/admin" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={28} height={28} priority />
        </Link>
        <div className="ml-2 dsc-headline text-lg text-black truncate">
          {date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        {/* Date hero */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="dsc-label text-black/40 mb-1">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="dsc-headline text-5xl md:text-6xl text-black leading-none">
              {date.toLocaleDateString('en-US', { month: 'short' })}{' '}
              {date.getDate()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {prevDay && (
              <Link
                href={`/admin/calendar/${dateKey(prevDay)}`}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
                aria-label="Previous day"
              >
                ←
              </Link>
            )}
            {nextDay && (
              <Link
                href={`/admin/calendar/${dateKey(nextDay)}`}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
                aria-label="Next day"
              >
                →
              </Link>
            )}
          </div>
        </div>

        {/* Add row */}
        <button
          onClick={handleAdd}
          className="w-full mb-4 h-12 bg-black text-white rounded-full dsc-headline text-base"
        >
          + Add session
        </button>

        {/* Sessions */}
        {sorted.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">Empty day</div>
            <p className="text-sm text-black/60">
              No sessions on the books. Tap{' '}
              <span className="font-semibold text-black">Add session</span> to
              schedule something.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((s) => {
              const isGroup = (s.attendees?.length ?? 1) > 1
              const displayName = isGroup
                ? `${s.attendees![0].firstName} +${s.attendees!.length - 1}`
                : `${s.athlete.firstName} ${s.athlete.lastName}`
              return (
                <button
                  key={s.id}
                  onClick={s.cancelled ? undefined : () => handleTap(s)}
                  disabled={s.cancelled}
                  className={`w-full rounded-3xl p-5 flex items-center justify-between gap-4 ${
                    s.cancelled
                      ? 'bg-black/[0.04] text-black/40 line-through'
                      : s.completed
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-black text-white hover:bg-black/90 active:opacity-80'
                  }`}
                >
                  <div className="flex items-baseline gap-4 min-w-0 text-left">
                    <div className="font-mono text-sm opacity-75 shrink-0 w-16">
                      {fmtTime(s.scheduledAt)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{displayName}</div>
                      <div className="dsc-label opacity-60 mt-0.5">
                        {s.trainer.user.name} · {s.duration} min
                      </div>
                    </div>
                  </div>
                  {!s.cancelled && (
                    <span className="dsc-label opacity-50 shrink-0">Edit</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <SessionEditSheet
        open={sheetOpen}
        initial={draft}
        trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
        athletes={athletes}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          loadSessions()
        }}
      />
    </div>
  )
}
