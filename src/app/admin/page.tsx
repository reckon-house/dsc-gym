'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  RequestActionSheet,
  type RequestSummary,
} from './_components/RequestActionSheet'

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

interface ClassRequest {
  id: string
  athleteName: string
  groupName: string
  dayOfWeek: number | null
  startMinute: number | null
  enrolled: number
  capacity: number | null
  note: string | null
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

// Secondary destinations. Kept out of the square-card grid so the four
// everyday jobs stay the thing you see first — and so an odd count doesn't
// leave a hole in a two-column layout.
const LINKS: { href: string; label: string; desc: string }[] = [
  { href: '/admin/groups', label: 'Groups', desc: 'Rosters & standing times' },
  { href: '/admin/blasts', label: 'Announcements', desc: 'Email the gym' },
  { href: '/admin/recovery', label: 'Recovery', desc: 'Room charges' },
]

export default function AdminHome() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [walkIns, setWalkIns] = useState<WalkIn[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedAthlete[]>([])
  const [trainers, setTrainers] = useState<TrainerOption[]>([])
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([])
  const [classRequests, setClassRequests] = useState<ClassRequest[]>([])
  const [extraVisits, setExtraVisits] = useState<
    { athleteId: string; name: string; extraVisits: number }[]
  >([])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [resolvingReq, setResolvingReq] = useState<string | null>(null)
  const [sheet, setSheet] = useState<
    | null
    | { kind: 'decline'; request: RequestSummary; suggestedReason?: string }
    | { kind: 'conflict'; request: RequestSummary; conflicts: string[] }
  >(null)

  const loadAuxiliary = useCallback(async () => {
    const [t, w, u, br, ev, gr] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/walkins').then((r) => r.json()),
      fetch('/api/athletes?unassigned=true').then((r) => r.json()),
      fetch('/api/admin/booking-requests').then((r) => r.json()),
      fetch('/api/admin/attendance/extra?days=30').then((r) => r.json()),
      fetch('/api/admin/group-requests').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (w.success) setWalkIns(w.data)
    if (u.success) setUnassigned(u.data)
    if (br.success) setBookingRequests(br.data)
    if (ev.success) setExtraVisits(ev.data.rows)
    if (gr.success) setClassRequests(gr.data)
  }, [])

  function summarizeRequest(r: BookingRequest): RequestSummary {
    return {
      id: r.id,
      athleteName: r.athleteName,
      trainerName: r.trainerName,
      when: new Date(r.scheduledAt).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      duration: r.duration,
    }
  }

  async function approveRequest(id: string) {
    setResolvingReq(id)
    try {
      const res = await fetch(`/api/admin/booking-requests/${id}/approve`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.success) {
        const conflicts: string[] =
          data.conflicts?.map((c: { message: string }) => c.message) ?? [
            data.error ?? 'Unknown error.',
          ]
        const target = bookingRequests.find((r) => r.id === id)
        if (target) {
          setSheet({
            kind: 'conflict',
            request: summarizeRequest(target),
            conflicts,
          })
        }
      }
      await loadAuxiliary()
    } finally {
      setResolvingReq(null)
    }
  }

  function declineRequest(id: string) {
    const target = bookingRequests.find((r) => r.id === id)
    if (!target) return
    setSheet({ kind: 'decline', request: summarizeRequest(target) })
  }

  async function submitDecline(id: string, reason: string | null) {
    setResolvingReq(id)
    try {
      await fetch(`/api/admin/booking-requests/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      await loadAuxiliary()
      setSheet(null)
    } finally {
      setResolvingReq(null)
    }
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

  async function resolveClassRequest(id: string, action: 'approve' | 'decline') {
    setResolvingReq(id)
    const res = await fetch(`/api/admin/group-requests/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    setResolvingReq(null)
    if (!data.success) {
      // A full class or an archived athlete leaves the request pending on
      // purpose, so say why rather than silently doing nothing.
      alert(data.error ?? 'Could not update that request.')
      return
    }
    await loadAuxiliary()
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
            Dallas Sport Collective
          </span>
        </div>
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

      {/* Alerts row */}
      {(walkIns.length > 0 ||
        unassigned.length > 0 ||
        bookingRequests.length > 0 ||
        classRequests.length > 0 ||
        extraVisits.length > 0) && (
        <div className="px-4 space-y-2 pb-2">
          {classRequests.length > 0 && (
            <ClassRequestsBox
              requests={classRequests}
              onApprove={(id) => resolveClassRequest(id, 'approve')}
              onDecline={(id) => resolveClassRequest(id, 'decline')}
              resolving={resolvingReq}
            />
          )}
          {bookingRequests.length > 0 && (
            <BookingRequestsBox
              requests={bookingRequests}
              onApprove={approveRequest}
              onDecline={declineRequest}
              resolving={resolvingReq}
            />
          )}
          {extraVisits.length > 0 && (
            <div className="px-4 py-3 rounded-2xl bg-black/[0.05] border border-black/10 max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-black" aria-hidden />
                <span className="dsc-label text-black">
                  Extra visits · {extraVisits.length}
                </span>
              </div>
              <p className="text-xs text-black/60 mb-2">
                Checked in without a scheduled session in the last 30 days.
              </p>
              <div className="space-y-2">
                {extraVisits.slice(0, 5).map((r) => (
                  <Link
                    key={r.athleteId}
                    href={`/admin/athletes/${r.athleteId}`}
                    className="bg-white rounded-2xl p-3 flex items-center gap-3 hover:bg-black/[0.02]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-black truncate font-medium">{r.name}</div>
                    </div>
                    <span className="dsc-label text-black/60 shrink-0">
                      {r.extraVisits}&times;
                    </span>
                  </Link>
                ))}
              </div>
            </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-3xl mx-auto mt-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center justify-between gap-3 bg-black/[0.04] hover:bg-black/[0.07] rounded-2xl px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="dsc-headline text-base text-black truncate">{l.label}</div>
                <div className="dsc-label text-black/40 group-hover:text-black/60 truncate">
                  {l.desc}
                </div>
              </div>
              <span className="text-black/30 group-hover:text-black/60 shrink-0">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Gym photo footer */}
      <div className="mt-auto px-4 pb-4">
        <div className="max-w-3xl mx-auto rounded-3xl overflow-hidden aspect-[16/9] md:aspect-[21/9] bg-black/5">
          <img
            src="/checkin-bg.jpg"
            alt="Dallas Sport Collective"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {sheet && (
        <RequestActionSheet
          mode={sheet}
          onClose={() => setSheet(null)}
          onDeclineSubmit={submitDecline}
          onConflictDecline={(request, suggestedReason) =>
            setSheet({ kind: 'decline', request, suggestedReason })
          }
        />
      )}
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
  // Kept for API compatibility with existing callers — both tones now
  // render the same brand-faint-grey look as the booking-requests box.
  // The only difference is the tiny dot color, which we keep so the
  // walk-ins (transient, in-the-moment) and new-registrations (more
  // persistent admin queue) are still glance-distinguishable.
  tone: 'orange' | 'blue'
  label: string
  rows: AlertRow[]
  trainers: TrainerOption[]
}) {
  // Faint-grey card matches the brand. Dot is the only color hint, and
  // it's saturated enough to read at a glance without screaming.
  const dotClass = tone === 'orange' ? 'bg-amber-500' : 'bg-black'

  return (
    <div className="px-4 py-3 rounded-2xl bg-black/[0.05] border border-black/10 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
        <span className="dsc-label text-black">{label}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-2xl p-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-black truncate">
                <span className="font-medium">{r.primary}</span>
                {r.secondary && (
                  <span className="ml-2 text-xs text-black/50">
                    {r.secondary}
                  </span>
                )}
              </div>
            </div>
            <select
              className="shrink-0 bg-black/5 border-0 text-black rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-black/20"
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

const REQ_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function reqTime(m: number): string {
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm}${ampm}`
}

/**
 * "Can my kid join this class?" — the open-groups counterpart to
 * BookingRequestsBox. Approving adds them to the roster AND to every future
 * session the group already has, so there's no second step to forget.
 */
function ClassRequestsBox({
  requests,
  onApprove,
  onDecline,
  resolving,
}: {
  requests: ClassRequest[]
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  resolving: string | null
}) {
  return (
    <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-emerald-600" />
        <span className="dsc-label text-emerald-900">
          Class requests · {requests.length}
        </span>
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-black text-sm">
                <span className="font-medium">{r.athleteName}</span>
                <span className="text-black/50"> wants a spot in </span>
                <span className="font-medium">{r.groupName}</span>
              </div>
              <div className="text-xs text-black/60 mt-0.5">
                {r.dayOfWeek !== null && r.startMinute !== null
                  ? `${REQ_DAYS[r.dayOfWeek]}s · ${reqTime(r.startMinute)}`
                  : 'No standing time'}
                {' · '}
                {r.capacity !== null
                  ? `${r.enrolled}/${r.capacity} spots taken`
                  : `${r.enrolled} enrolled`}
              </div>
              {r.note && (
                <div className="text-xs text-black/70 mt-1 italic truncate">
                  &ldquo;{r.note}&rdquo;
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
                className="h-8 px-3 border border-black/20 text-black/70 text-xs rounded-full disabled:opacity-40"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
