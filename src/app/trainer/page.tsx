'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  TrainerScheduleSheet,
  type TrainerSessionDraft,
} from './_components/TrainerScheduleSheet'
import { AttendanceSheet } from '@/components/AttendanceSheet'
import { TimeOffSheet } from '@/components/TimeOffSheet'
import { QuickCheckIn } from '@/components/QuickCheckIn'

interface SessionRow {
  id: string
  athleteId: string
  scheduledAt: string
  duration: number
  cancelled: boolean
  completed: boolean
  // Null for an open class nobody has joined yet.
  athlete: { firstName: string; lastName: string } | null
  attendees?: { id: string; firstName: string; lastName: string }[]
}

interface OwedRow {
  id: string
  scheduledAt: string
  duration: number
  label: string
  count: number
}

/** First name(s) for a session pill — never assumes a primary athlete exists. */
function who(s: SessionRow, full = false): string {
  const people = s.attendees?.length ? s.attendees : s.athlete ? [s.athlete] : []
  if (people.length === 0) return 'Open class'
  if (people.length > 1) return `${people[0].firstName} +${people.length - 1}`
  return full ? `${people[0].firstName} ${people[0].lastName}` : people[0].firstName
}

interface AthleteRow {
  id: string
  firstName: string
  lastName: string
  email: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmtTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')
}

interface TimeOffRow {
  id: string
  label: string
  reason: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  decisionNote: string | null
}

export default function TrainerDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [owed, setOwed] = useState<OwedRow[]>([])
  const [attendanceFor, setAttendanceFor] = useState<string | null>(null)
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([])
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [injuries, setInjuries] = useState<{ count: number; fresh: number; iAmPT: boolean } | null>(null)
  const [sheetInitial, setSheetInitial] = useState<TrainerSessionDraft | null>(null)

  function openCreate() {
    setSheetInitial(null)
    setSheetOpen(true)
  }
  function openEdit(s: SessionRow) {
    setSheetInitial({
      id: s.id,
      athleteId: s.athleteId,
      scheduledAt: s.scheduledAt,
      duration: s.duration,
    })
    setSheetOpen(true)
  }

  const loadSessions = useCallback(async () => {
    const start = startOfWeek(new Date())
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const res = await fetch(
      `/api/sessions?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    )
    const data = await res.json()
    if (data.success) setSessions(data.data)
  }, [])

  const loadOwed = useCallback(async () => {
    const res = await fetch('/api/attendance/owed')
    const data = await res.json()
    if (data.success) setOwed(data.data)
  }, [])

  const loadInjuries = useCallback(async () => {
    const d = await fetch('/api/injuries?view=open')
      .then((r) => r.json())
      .catch(() => null)
    if (d?.success) {
      const items = d.data.items as { ptStatus: string }[]
      setInjuries({ count: items.length, fresh: items.filter((i) => i.ptStatus === 'flagged').length, iAmPT: d.data.iAmPT })
    }
  }, [])

  const loadTimeOff = useCallback(async () => {
    // Upcoming and recent only; last month's approved days are just noise.
    const since = new Date()
    since.setDate(since.getDate() - 7)
    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`
    const res = await fetch(`/api/time-off?status=pending,approved,declined&from=${from}`)
    const data = await res.json()
    if (data.success) setTimeOff(data.data)
  }, [])

  async function withdrawTimeOff(id: string) {
    if (!confirm('Withdraw this request?')) return
    await fetch(`/api/time-off/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    loadTimeOff()
  }

  const loadAthletes = useCallback(async () => {
    const res = await fetch('/api/athletes')
    const data = await res.json()
    if (data.success) setAthletes(data.data)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          router.replace('/login')
          return
        }
        if (d.user.role === 'ADMIN') {
          router.replace('/admin')
          return
        }
        setUser(d.user)
      })
  }, [router])

  useEffect(() => {
    loadSessions()
    loadAthletes()
    loadOwed()
    loadTimeOff()
    loadInjuries()
  }, [loadSessions, loadAthletes, loadOwed, loadTimeOff, loadInjuries])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const today = new Date()
  const weekStart = startOfWeek(today)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const sessionsByDay = sessions.reduce<Record<string, SessionRow[]>>(
    (acc, s) => {
      const key = new Date(s.scheduledAt).toDateString()
      ;(acc[key] ??= []).push(s)
      return acc
    },
    {}
  )
  for (const k of Object.keys(sessionsByDay)) {
    sessionsByDay[k].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
  }

  const todaySessions = sessions.filter((s) =>
    isSameDay(new Date(s.scheduledAt), today)
  )

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 md:px-6 py-5 flex items-center justify-between border-b border-black/10">
        <Link href="/trainer" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
        <div className="flex items-center gap-3">
          <span className="dsc-label text-black/60 hidden sm:inline">
            {user?.name}
          </span>
          <Link
            href="/account"
            className="dsc-label text-black/60 hover:text-black"
          >
            Account
          </Link>
          <button
            onClick={handleLogout}
            className="dsc-label text-black/60 hover:text-black"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="px-4 md:px-6 py-6 max-w-3xl mx-auto w-full flex-1 space-y-8">
        <QuickCheckIn />

        {/* Hero — today */}
        <section>
          <div className="dsc-label text-black/40 mb-1">
            {today.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <h1 className="dsc-headline text-4xl md:text-5xl text-black">
              {user?.name?.split(' ')[0] || 'Trainer'}
            </h1>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/injuries"
                className="h-10 px-4 rounded-full bg-black/5 hover:bg-black/10 text-sm font-semibold text-black flex items-center"
              >
                Injuries
              </Link>
              <Link
                href="/schedule"
                className="h-10 px-4 rounded-full bg-black/5 hover:bg-black/10 text-sm font-semibold text-black flex items-center"
              >
                Gym schedule →
              </Link>
            </div>
          </div>
          {injuries && injuries.count > 0 && (
            <Link
              href="/injuries"
              className="block mb-5 rounded-3xl bg-rose-50 border border-rose-200 px-5 py-4 text-rose-950 hover:bg-rose-100"
            >
              <div className="dsc-label text-rose-900/70">
                {injuries.iAmPT ? 'PT follow-ups' : 'Injuries with the PT'}
              </div>
              <div className="font-semibold mt-0.5">
                {injuries.iAmPT && injuries.fresh > 0
                  ? `${injuries.fresh} new to look at${injuries.count > injuries.fresh ? ` · ${injuries.count} open` : ''}`
                  : `${injuries.count} open`}
              </div>
            </Link>
          )}

          {todaySessions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 p-6 text-center">
              <div className="dsc-label text-black/40 mb-1">Today</div>
              <p className="text-sm text-black/60">
                No sessions on the books for today.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl bg-black text-white p-6">
              <div className="dsc-label text-white/60 mb-3">
                Today · {todaySessions.length}
              </div>
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={s.cancelled ? undefined : () => setAttendanceFor(s.id)}
                    className="w-full flex items-baseline justify-between gap-3 text-left rounded-xl -mx-2 px-2 py-1 hover:bg-white/10"
                  >
                    <div className="dsc-headline text-2xl text-white">
                      {fmtTime(s.scheduledAt)}
                    </div>
                    <div className="text-white/80 text-sm text-right">
                      {who(s, true)} · {s.duration}m
                      <div className="dsc-label text-white/50">
                        {s.completed ? 'Attendance taken' : 'Tap to take attendance'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Attendance still owed. Past sessions only; the list is the
            reminder, so nobody has to remember to go looking. */}
        {owed.length > 0 && (
          <section>
            <div className="dsc-label text-black/50 mb-3">
              Needs attendance · {owed.length}
            </div>
            <div className="space-y-2">
              {owed.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setAttendanceFor(o.id)}
                  className="w-full rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-amber-100"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-black truncate">{o.label}</div>
                    <div className="dsc-label text-black/50 mt-0.5">
                      {new Date(o.scheduledAt).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <span className="dsc-label text-amber-800 shrink-0">Take it</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* This week */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <div className="dsc-label text-black/50">This week</div>
            <button
              onClick={openCreate}
              className="dsc-label bg-black text-white px-3 py-1.5 rounded-full hover:bg-black/85"
            >
              + Schedule
            </button>
          </div>

          <div className="border border-black/10 rounded-3xl overflow-hidden">
            {days.map((d) => {
              const key = d.toDateString()
              const list = sessionsByDay[key] ?? []
              const isToday = isSameDay(d, today)
              return (
                <div
                  key={key}
                  className={`border-b border-black/10 last:border-b-0 grid grid-cols-[64px_1fr] items-center px-4 py-3 ${
                    isToday ? 'bg-black/[0.04]' : ''
                  }`}
                >
                  <div>
                    <div className="dsc-label text-black/40">
                      {DAY_NAMES[d.getDay()]}
                    </div>
                    <div className="dsc-headline text-2xl text-black leading-none">
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.length === 0 ? (
                      <span className="text-xs text-black/30 italic">—</span>
                    ) : (
                      list.map((s) => {
                        const base = s.cancelled
                          ? 'bg-black/5 text-black/40 line-through'
                          : s.completed
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-black text-white hover:opacity-85 active:opacity-70 cursor-pointer'
                        return (
                          <button
                            key={s.id}
                            onClick={s.cancelled ? undefined : () => openEdit(s)}
                            disabled={s.cancelled}
                            className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded text-xs leading-tight ${base}`}
                          >
                            <span className="font-mono text-[10px] opacity-80">
                              {fmtTime(s.scheduledAt)}
                            </span>
                            <span className="font-medium">{who(s)}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Time off */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="dsc-label text-black/50">Time off</div>
            <button
              onClick={() => setTimeOffOpen(true)}
              className="dsc-label px-3 py-1.5 rounded-full bg-black/5 text-black hover:bg-black/10"
            >
              + Request
            </button>
          </div>
          {timeOff.length === 0 ? (
            <p className="text-sm text-black/40">Nothing requested.</p>
          ) : (
            <div className="grid gap-2">
              {timeOff.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-black/10 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-black truncate">{t.label}</div>
                    {(t.reason || t.decisionNote) && (
                      <div className="text-sm text-black/50 truncate">
                        {t.decisionNote ? `Note: ${t.decisionNote}` : t.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`dsc-label px-2 py-1 rounded-full ${
                        t.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-900'
                          : t.status === 'declined'
                            ? 'bg-red-50 text-red-900'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {t.status === 'pending' ? 'Waiting' : t.status === 'approved' ? 'Approved' : 'Declined'}
                    </span>
                    {t.status === 'pending' && (
                      <button
                        onClick={() => withdrawTimeOff(t.id)}
                        className="dsc-label text-black/40 hover:text-black"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My athletes */}
        <section>
          <div className="dsc-label text-black/50 mb-3">
            My athletes · {athletes.length}
          </div>
          {athletes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 p-6 text-center">
              <p className="text-sm text-black/60">
                No athletes assigned yet. The admin assigns members to trainers.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {[...athletes]
                .sort((a, b) => a.lastName.localeCompare(b.lastName))
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-black/10 px-4 py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-black truncate">
                        {a.firstName} {a.lastName}
                      </div>
                      <div className="text-sm text-black/50 truncate">
                        {a.email}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      <AttendanceSheet
        sessionId={attendanceFor}
        open={attendanceFor !== null}
        onClose={() => setAttendanceFor(null)}
        onSaved={() => {
          loadSessions()
          loadOwed()
        }}
      />

      <TimeOffSheet
        open={timeOffOpen}
        onClose={() => setTimeOffOpen(false)}
        onSaved={loadTimeOff}
      />

      <TrainerScheduleSheet
        open={sheetOpen}
        initial={sheetInitial}
        athletes={athletes}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          loadSessions()
        }}
      />
    </div>
  )
}
