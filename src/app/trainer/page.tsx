'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { TrainerScheduleSheet } from './_components/TrainerScheduleSheet'

interface SessionRow {
  id: string
  scheduledAt: string
  duration: number
  cancelled: boolean
  completed: boolean
  athlete: { firstName: string; lastName: string }
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

export default function TrainerDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)

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
  }, [loadSessions, loadAthletes])

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
          <button
            onClick={handleLogout}
            className="dsc-label text-black/60 hover:text-black"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="px-4 md:px-6 py-6 max-w-3xl mx-auto w-full flex-1 space-y-8">
        {/* Hero — today */}
        <section>
          <div className="dsc-label text-black/40 mb-1">
            {today.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <h1 className="dsc-headline text-4xl md:text-5xl text-black mb-5">
            {user?.name?.split(' ')[0] || 'Trainer'}
          </h1>

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
                  <div
                    key={s.id}
                    className="flex items-baseline justify-between"
                  >
                    <div className="dsc-headline text-2xl text-white">
                      {fmtTime(s.scheduledAt)}
                    </div>
                    <div className="text-white/80 text-sm">
                      {s.athlete.firstName} {s.athlete.lastName} · {s.duration}m
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* This week */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <div className="dsc-label text-black/50">This week</div>
            <button
              onClick={() => setSheetOpen(true)}
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
                    isToday ? 'bg-yellow-50' : ''
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
                      list.map((s) => (
                        <span
                          key={s.id}
                          className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded text-xs leading-tight ${
                            s.cancelled
                              ? 'bg-black/5 text-black/40 line-through'
                              : s.completed
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-black text-white'
                          }`}
                        >
                          <span className="font-mono text-[10px] opacity-80">
                            {fmtTime(s.scheduledAt)}
                          </span>
                          <span className="font-medium">
                            {s.athlete.firstName}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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

      <TrainerScheduleSheet
        open={sheetOpen}
        athletes={athletes}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          loadSessions()
        }}
      />
    </div>
  )
}
