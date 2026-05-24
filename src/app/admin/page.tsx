'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface WalkIn {
  id: string
  name: string
  email: string | null
  checkInTime: string
}

interface UnassignedAthlete {
  id: string
  firstName: string
  lastName: string
  email: string
  createdAt: string
}

interface TrainerOption {
  id: string
  user: { name: string }
}

const CARDS: {
  href: string
  label: string
  desc: string
}[] = [
  {
    href: '/admin/chat',
    label: 'Chat /\nSchedule',
    desc: 'Talk to the scheduler',
  },
  { href: '/admin/calendar', label: 'Calendar', desc: 'See the week' },
  { href: '/admin/trainers', label: 'Trainers', desc: 'Hours & roster' },
  { href: '/admin/athletes', label: 'Athletes', desc: 'Members & assignments' },
]

export default function AdminHome() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [walkIns, setWalkIns] = useState<WalkIn[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedAthlete[]>([])
  const [trainers, setTrainers] = useState<TrainerOption[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)

  const loadAuxiliary = useCallback(async () => {
    const [t, w, u] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/walkins').then((r) => r.json()),
      fetch('/api/athletes?unassigned=true').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (w.success) setWalkIns(w.data)
    if (u.success) setUnassigned(u.data)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          router.replace('/login')
          return
        }
        setUser(d.user)
      })
  }, [router])

  useEffect(() => {
    loadAuxiliary()
  }, [loadAuxiliary])

  async function assignWalkIn(walkInId: string, trainerId: string) {
    setAssigning(walkInId)
    await fetch(`/api/walkins/${walkInId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainerId }),
    })
    await loadAuxiliary()
    setAssigning(null)
  }

  async function assignAthlete(athleteId: string, trainerId: string) {
    setAssigning(athleteId)
    await fetch(`/api/athletes/${athleteId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainerId }),
    })
    await loadAuxiliary()
    setAssigning(null)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top — wordmark + user */}
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="dsc-headline text-2xl md:text-3xl text-black">DSC</span>
          <span className="dsc-label text-black/40 hidden sm:inline">
            Dallas Sports Collective
          </span>
        </div>
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

      {/* Alerts row */}
      {(walkIns.length > 0 || unassigned.length > 0) && (
        <div className="px-4 space-y-2 pb-2">
          {walkIns.length > 0 && (
            <AlertBox
              tone="orange"
              label={`Walk-ins · ${walkIns.length}`}
              rows={walkIns.map((w) => ({
                id: w.id,
                primary: w.name,
                secondary: new Date(w.checkInTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                onAssign: (tid) => assignWalkIn(w.id, tid),
                pending: assigning === w.id,
              }))}
              trainers={trainers}
            />
          )}
          {unassigned.length > 0 && (
            <AlertBox
              tone="blue"
              label={`New registrations · ${unassigned.length}`}
              rows={unassigned.map((a) => ({
                id: a.id,
                primary: `${a.firstName} ${a.lastName}`,
                secondary: a.email,
                onAssign: (tid) => assignAthlete(a.id, tid),
                pending: assigning === a.id,
              }))}
              trainers={trainers}
            />
          )}
        </div>
      )}

      {/* The launcher: 4 cards */}
      <section className="px-4 pt-2 pb-4">
        <div className="grid grid-cols-2 gap-3 md:gap-4 max-w-3xl mx-auto">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group block bg-black/[0.04] hover:bg-black/[0.07] rounded-3xl p-4 md:p-7 aspect-square flex flex-col justify-between transition-colors overflow-hidden"
            >
              <div className="dsc-label text-black/40 group-hover:text-black/60 break-words">
                {c.desc}
              </div>
              <div className="dsc-headline text-2xl sm:text-3xl md:text-5xl text-black whitespace-pre-line leading-[0.9] break-words">
                {c.label}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Gym photo footer */}
      <div className="mt-auto px-4 pb-4">
        <div className="max-w-3xl mx-auto rounded-3xl overflow-hidden aspect-[16/9] md:aspect-[21/9] bg-black/5">
          <img
            src="/checkin-bg.jpg"
            alt="Dallas Sports Collective"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  )
}

interface AlertRow {
  id: string
  primary: string
  secondary?: string
  pending?: boolean
  onAssign: (trainerId: string) => void
}

function AlertBox({
  tone,
  label,
  rows,
  trainers,
}: {
  tone: 'orange' | 'blue'
  label: string
  rows: AlertRow[]
  trainers: TrainerOption[]
}) {
  const cls = {
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-900' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-900' },
  }[tone]

  return (
    <div
      className={`px-4 py-2.5 rounded-2xl border ${cls.bg} ${cls.border} max-w-3xl mx-auto`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${cls.dot}`} />
        <span className={`dsc-label ${cls.text}`}>{label}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 text-sm text-black"
          >
            <span className="truncate">
              {r.primary}
              {r.secondary && (
                <span className="ml-2 text-xs text-black/50">{r.secondary}</span>
              )}
            </span>
            <select
              className="bg-white border border-black/20 text-black rounded px-2 py-0.5 text-xs"
              defaultValue=""
              onChange={(e) => e.target.value && r.onAssign(e.target.value)}
              disabled={r.pending}
            >
              <option value="" disabled>
                Assign…
              </option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
