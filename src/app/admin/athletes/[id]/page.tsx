'use client'

// Athlete detail. Right now the headline feature here is "standing
// weekly slots" — recurring bookings the gym can lock in once and have
// the engine auto-materialize as real Sessions. Athlete header + a
// few quick stats too; deeper detail (full session history, check-in
// stats) can come later.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Athlete {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  emailVerified: boolean
  waiverSignedAt: string | null
  trainerId: string | null
  trainer: { id: string; user: { name: string } } | null
  _count: { sessions: number; checkIns: number }
}

interface StandingSlot {
  id: string
  trainerId: string | null
  dayOfWeek: number
  startMinute: number
  duration: number
  active: boolean
  notes: string | null
}

interface TrainerOpt {
  id: string
  user: { name: string }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function minutesToHHMM(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function minutesTo12h(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(min).padStart(2, '0')} ${period}`
}

export default function AthleteDetail() {
  const router = useRouter()
  const params = useParams()
  const athleteId = params.id as string

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [slots, setSlots] = useState<StandingSlot[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [a, s, t] = await Promise.all([
      fetch(`/api/athletes/${athleteId}`).then((r) => r.json()),
      fetch(`/api/athletes/${athleteId}/standing-slots`).then((r) => r.json()),
      fetch('/api/trainers').then((r) => r.json()),
    ])
    if (a.success) setAthlete(a.data)
    if (s.success) setSlots(s.data)
    if (t.success) setTrainers(t.data)
    setLoading(false)
  }, [athleteId])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
        else load()
      })
  }, [router, load])

  async function toggleActive(slot: StandingSlot) {
    setBusy(slot.id)
    await fetch(`/api/athletes/${athleteId}/standing-slots/${slot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !slot.active }),
    })
    await load()
    setBusy(null)
  }

  async function extend(slot: StandingSlot, weeks: number) {
    setBusy(slot.id)
    const res = await fetch(
      `/api/athletes/${athleteId}/standing-slots/${slot.id}/materialize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks }),
      }
    )
    const data = await res.json()
    if (data.success) {
      const c = data.data.created.length
      const s = data.data.skipped.length
      alert(
        `${c} new session${c === 1 ? '' : 's'} created.` +
          (s > 0 ? ` ${s} skipped (conflicts or already booked).` : '')
      )
    }
    await load()
    setBusy(null)
  }

  async function removeSlot(slot: StandingSlot) {
    if (!confirm('Delete this standing slot? Existing materialized sessions will stay (cancel them individually if needed).')) return
    setBusy(slot.id)
    await fetch(`/api/athletes/${athleteId}/standing-slots/${slot.id}`, {
      method: 'DELETE',
    })
    await load()
    setBusy(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="dsc-label text-black/50">Loading…</div>
      </div>
    )
  }
  if (!athlete) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="dsc-label text-black/50">Athlete not found.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href="/admin/athletes"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
          aria-label="Back to athletes"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="dsc-headline text-lg md:text-xl text-black truncate">
          {athlete.firstName} {athlete.lastName}
        </div>
      </header>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        {/* Identity card */}
        <div className="rounded-3xl bg-black/[0.04] p-5">
          <div className="dsc-label text-black/40 mb-1">Athlete</div>
          <h1 className="dsc-headline text-3xl md:text-4xl text-black mb-3 leading-[0.95]">
            {athlete.firstName}
            <br />
            {athlete.lastName}
          </h1>
          <div className="text-sm text-black/70">{athlete.email}</div>
          {athlete.phone && (
            <div className="text-sm text-black/50 mt-0.5">{athlete.phone}</div>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {athlete.trainer ? (
              <span className="dsc-label px-2 py-1 rounded-full bg-black/10 text-black">
                with {athlete.trainer.user.name}
              </span>
            ) : (
              <span className="dsc-label px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                Unassigned
              </span>
            )}
            {!athlete.waiverSignedAt && (
              <span className="dsc-label px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                Waiver pending
              </span>
            )}
            <span className="dsc-label px-2 py-1 rounded-full bg-black/[0.06] text-black/60">
              {athlete._count.sessions} sessions
            </span>
            <span className="dsc-label px-2 py-1 rounded-full bg-black/[0.06] text-black/60">
              {athlete._count.checkIns} check-ins
            </span>
          </div>
        </div>

        {/* Standing weekly slots */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="dsc-label text-black/40">Standing weekly</div>
              <h2 className="dsc-headline text-2xl text-black leading-tight">
                Recurring slots
              </h2>
            </div>
            <button
              onClick={() => setShowAddSlot(true)}
              className="h-9 px-4 bg-black text-white rounded-full dsc-headline text-sm"
            >
              + Add
            </button>
          </div>

          {slots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 p-6 text-center">
              <div className="dsc-label text-black/40 mb-1">No standing slots</div>
              <p className="text-sm text-black/60">
                Lock in a recurring slot and the next 8 weeks of sessions are
                auto-created.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {slots.map((slot) => {
                const trainerName =
                  trainers.find((t) => t.id === slot.trainerId)?.user.name ?? 'Unassigned'
                return (
                  <div
                    key={slot.id}
                    className={`rounded-2xl p-4 ${slot.active ? 'bg-black/[0.04]' : 'bg-black/[0.02] opacity-70'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-black">
                          <span className="font-medium">
                            {DAY_NAMES[slot.dayOfWeek]}s
                          </span>
                          <span className="text-black/60">
                            {' · '}
                            {minutesTo12h(slot.startMinute)} ({slot.duration}min)
                          </span>
                        </div>
                        <div className="text-xs text-black/60 mt-0.5">
                          with {trainerName.split(' ')[0]}
                        </div>
                        {slot.notes && (
                          <div className="text-xs text-black/60 mt-1 italic truncate">
                            {slot.notes}
                          </div>
                        )}
                        {!slot.active && (
                          <span className="dsc-label text-black/40 mt-1 inline-block">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 text-xs">
                      <button
                        onClick={() => extend(slot, 4)}
                        disabled={!slot.active || busy === slot.id}
                        className="h-8 px-3 bg-black text-white rounded-full dsc-headline disabled:opacity-40"
                      >
                        Extend 4 wks
                      </button>
                      <button
                        onClick={() => toggleActive(slot)}
                        disabled={busy === slot.id}
                        className="h-8 px-3 bg-white border border-black/20 text-black rounded-full disabled:opacity-40"
                      >
                        {slot.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => removeSlot(slot)}
                        disabled={busy === slot.id}
                        className="h-8 px-3 text-black/60 hover:text-black disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showAddSlot && (
        <AddStandingSlotSheet
          athleteId={athleteId}
          trainers={trainers}
          defaultTrainerId={athlete.trainer?.id}
          onClose={() => setShowAddSlot(false)}
          onCreated={async () => {
            setShowAddSlot(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function AddStandingSlotSheet({
  athleteId,
  trainers,
  defaultTrainerId,
  onClose,
  onCreated,
}: {
  athleteId: string
  trainers: TrainerOpt[]
  defaultTrainerId?: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [trainerId, setTrainerId] = useState(defaultTrainerId ?? trainers[0]?.id ?? '')
  const [dayOfWeek, setDayOfWeek] = useState(1) // Monday default
  const [timeStr, setTimeStr] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!trainerId) {
      alert('Pick a trainer.')
      return
    }
    const [h, m] = timeStr.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) {
      alert('Bad time.')
      return
    }
    setSubmitting(true)
    const res = await fetch(`/api/athletes/${athleteId}/standing-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainerId,
        dayOfWeek,
        startMinute: h * 60 + m,
        duration,
        notes: notes.trim() || null,
        weeksToMaterialize: 8,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!data.success) {
      alert(`Couldn't create: ${data.error}`)
      return
    }
    const { created, skipped } = data.data.materialized
    alert(
      `Standing slot created.\n${created.length} session${created.length === 1 ? '' : 's'} added.` +
        (skipped.length > 0
          ? `\n${skipped.length} skipped (conflicts or already booked).`
          : '')
    )
    await onCreated()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[85vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="dsc-label text-black/40">Standing weekly</div>
            <div className="dsc-headline text-2xl text-black">New slot</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <Field label="Trainer">
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="w-full h-11 px-3 bg-black/[0.04] rounded-xl text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Day of week">
            <div className="grid grid-cols-7 gap-1">
              {DAY_SHORT.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDayOfWeek(i)}
                  className={`h-10 rounded-xl text-xs dsc-label ${
                    dayOfWeek === i
                      ? 'bg-black text-white'
                      : 'bg-black/[0.04] text-black/70 hover:bg-black/[0.07]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Time">
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-11 px-3 bg-black/[0.04] rounded-xl text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              />
            </Field>
            <Field label="Length">
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full h-11 px-3 bg-black/[0.04] rounded-xl text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              >
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Strength focus block"
              className="w-full h-11 px-3 bg-black/[0.04] rounded-xl text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </Field>

          <div className="rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-black/60">
            Creates the slot and materializes the next 8 weeks of sessions.
            Conflicts get skipped (the gym can review them).
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base disabled:opacity-40"
            >
              {submitting ? 'Creating…' : 'Create + materialize'}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full h-12 text-black/60 rounded-full text-sm hover:text-black disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="dsc-label text-black/40 mb-1.5">{label}</div>
      {children}
    </label>
  )
}
