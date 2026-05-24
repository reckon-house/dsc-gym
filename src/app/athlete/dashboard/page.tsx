'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface UpcomingSession {
  id: string
  scheduledAt: string
  duration: number
  trainerName: string
}

interface AthleteSession {
  id: string
  name: string
  email: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function AthleteDashboard() {
  const router = useRouter()
  const [athlete, setAthlete] = useState<AthleteSession | null>(null)
  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/athletes/auth')
      const d = await r.json()
      if (!d.success) {
        router.replace('/athlete/login')
        return
      }
      setAthlete(d.athlete)
      const sRes = await fetch('/api/athletes/me/sessions')
      const sData = await sRes.json()
      if (sData.success) setSessions(sData.data)
      setLoading(false)
    })()
  }, [router])

  async function handleLogout() {
    await fetch('/api/athletes/auth', { method: 'DELETE' })
    router.push('/athlete/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="dsc-label text-black/50">Loading…</div>
      </div>
    )
  }

  const today = new Date()
  const nextSession = sessions[0]
  const todaySessions = sessions.filter((s) => isSameDay(new Date(s.scheduledAt), today))
  const upcoming = sessions.filter((s) => !isSameDay(new Date(s.scheduledAt), today))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
        <button
          onClick={handleLogout}
          className="dsc-label text-black/60 hover:text-black"
        >
          Log out
        </button>
      </header>

      <div className="px-4 py-2 max-w-2xl mx-auto w-full flex-1">
        {/* Hero greeting */}
        <div className="mb-8">
          <div className="dsc-label text-black/40 mb-1">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <h1 className="dsc-headline text-4xl md:text-5xl text-black">
            {athlete?.name?.split(' ')[0] || 'Athlete'}
          </h1>
        </div>

        {/* Next-up card */}
        {nextSession && !todaySessions.length && (
          <div className="rounded-3xl bg-black text-white p-6 mb-6">
            <div className="dsc-label text-white/60 mb-2">Up next</div>
            <div className="dsc-headline text-3xl text-white mb-1">
              {new Date(nextSession.scheduledAt).toLocaleDateString('en-US', {
                weekday: 'long',
              })}
            </div>
            <div className="text-white/80 font-mono text-sm">
              {new Date(nextSession.scheduledAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {nextSession.duration} min · with{' '}
              {nextSession.trainerName.split(' ')[0]}
            </div>
            <div className="text-white/50 text-xs mt-2">
              {new Date(nextSession.scheduledAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        )}

        {todaySessions.length > 0 && (
          <div className="rounded-3xl bg-black text-white p-6 mb-6">
            <div className="dsc-label text-white/60 mb-2">Today</div>
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-baseline justify-between"
                >
                  <div className="dsc-headline text-2xl text-white">
                    {new Date(s.scheduledAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-white/70 text-sm">
                    with {s.trainerName.split(' ')[0]} · {s.duration} min
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming list */}
        <div className="mb-3">
          <div className="dsc-label text-black/50">
            Upcoming · {upcoming.length}
          </div>
        </div>
        {upcoming.length === 0 && !nextSession ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">No sessions</div>
            <p className="text-sm text-black/60">
              Nothing on the books yet. Reach out to the gym to schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => {
              const d = new Date(s.scheduledAt)
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-black/10 p-4 flex items-center gap-4"
                >
                  <div className="text-center w-12 shrink-0">
                    <div className="dsc-label text-black/40">
                      {DAY_NAMES[d.getDay()]}
                    </div>
                    <div className="dsc-headline text-2xl text-black leading-none">
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-black">
                      {d.toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {s.duration} min
                    </div>
                    <div className="text-sm text-black/60 truncate">
                      with {s.trainerName.split(' ')[0]}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
