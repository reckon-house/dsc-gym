'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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

interface BookingRequest {
  id: string
  athleteName: string
  athleteEmail: string
  trainerName: string
  scheduledAt: string
  duration: number
  notes: string | null
  source: string
  createdAt: string
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
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [resolvingReq, setResolvingReq] = useState<string | null>(null)

  const loadAuxiliary = useCallback(async () => {
    const [t, w, u, br] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/walkins').then((r) => r.json()),
      fetch('/api/athletes?unassigned=true').then((r) => r.json()),
      fetch('/api/admin/booking-requests').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (w.success) setWalkIns(w.data)
    if (u.success) setUnassigned(u.data)
    if (br.success) setBookingRequests(br.data)
  }, [])

  async function approveRequest(id: string) {
    setResolvingReq(id)
    const res = await fetch(`/api/admin/booking-requests/${id}/approve`, {
      method: 'POST',
    })
    const data = await res.json()
    if (!data.success) {
      const reasons = data.conflicts?.map((c: { message: string }) => c.message).join('\n')
      alert(`Can't approve: ${reasons || data.error}`)
    }
    await loadAuxiliary()
    setResolvingReq(null)
  }

  async function declineRequest(id: string) {
    const reason = prompt('Optional reason to send the athlete:') ?? undefined
    setResolvingReq(id)
    await fetch(`/api/admin/booking-requests/${id}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    await loadAuxiliary()
    setResolvingReq(null)
  }

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
        <div className="flex items-center gap-3">
          <Image src="/logo-mark.png" alt="DSC" width={44} height={44} priority />
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
      {(walkIns.length > 0 || unassigned.length > 0 || bookingRequests.length > 0) && (
        <div className="px-4 space-y-2 pb-2">
          {bookingRequests.length > 0 && (
            <BookingRequestsBox
              requests={bookingRequests}
              onApprove={approveRequest}
              onDecline={declineRequest}
              resolving={resolvingReq}
            />
          )}
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

function BookingRequestsBox({
  requests,
  onApprove,
  onDecline,
  resolving,
}: {
  requests: BookingRequest[]
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  resolving: string | null
}) {
  return (
    <div className="px-4 py-3 rounded-2xl bg-black/[0.05] border border-black/10 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-black" />
        <span className="dsc-label text-black">
          Booking requests · {requests.length}
        </span>
      </div>
      <div className="space-y-2">
        {requests.map((r) => {
          const when = new Date(r.scheduledAt)
          const dayLabel = when.toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
          const timeLabel = when.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })
          return (
            <div
              key={r.id}
              className="bg-white rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-black text-sm">
                  <span className="font-medium">{r.athleteName}</span>
                  <span className="text-black/50"> wants </span>
                  <span className="font-medium">{r.trainerName}</span>
                </div>
                <div className="text-xs text-black/60 mt-0.5">
                  {dayLabel} · {timeLabel} · {r.duration}min
                  {r.source === 'mcp' && (
                    <span className="ml-2 dsc-label text-black/40">via AI</span>
                  )}
                </div>
                {r.notes && (
                  <div className="text-xs text-black/70 mt-1 italic truncate">
                    “{r.notes}”
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onApprove(r.id)}
                  disabled={resolving === r.id}
                  className="h-8 px-3 bg-black text-white text-xs rounded-full dsc-headline disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => onDecline(r.id)}
                  disabled={resolving === r.id}
                  className="h-8 px-3 text-black/60 text-xs hover:text-black disabled:opacity-40"
                >
                  Decline
                </button>
              </div>
            </div>
          )
        })}
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
