'use client'

import { useEffect, useState } from 'react'

interface TrainerOpt {
  id: string
  name: string
}
interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
  trainerId: string | null
}

export interface SessionDraft {
  id?: string // existing session id, when editing
  trainerId?: string
  athleteId?: string
  scheduledAt?: string // ISO
  duration?: number
  attendees?: { id: string; firstName: string; lastName: string }[]
}

interface Props {
  open: boolean
  initial: SessionDraft | null
  trainers: TrainerOpt[]
  athletes: AthleteOpt[]
  onClose: () => void
  onSaved: () => void
}

const DURATIONS = [30, 45, 60, 90]

function toLocalDatetimeInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  // Format yyyy-MM-ddTHH:mm in LOCAL time (no Z).
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SessionEditSheet({
  open,
  initial,
  trainers,
  athletes,
  onClose,
  onSaved,
}: Props) {
  const [trainerId, setTrainerId] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState<number>(60)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setTrainerId(initial?.trainerId ?? '')
    setAthleteId(initial?.athleteId ?? '')
    setWhen(toLocalDatetimeInput(initial?.scheduledAt))
    setDuration(initial?.duration ?? 60)
    setError(null)
  }, [open, initial])

  if (!open) return null

  async function handleSave() {
    setError(null)
    if (!trainerId || !athleteId || !when) {
      setError('Pick a trainer, an athlete, and a time.')
      return
    }
    setSaving(true)
    try {
      const body = {
        trainerId,
        athleteId,
        scheduledAt: new Date(when).toISOString(),
        duration,
      }
      const url = isEditing ? `/api/admin/sessions/${initial!.id}` : '/api/admin/sessions'
      const method = isEditing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Save failed.')
        setSaving(false)
        return
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (!isEditing) return
    if (!confirm('Cancel this session?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/sessions/${initial!.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        onSaved()
        onClose()
      } else {
        setError(data.error ?? 'Cancel failed.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Filter athletes to ones who belong to the selected trainer when both
  // chosen — but allow override (so admin can assign cross-trainer).
  const sortedAthletes = [...athletes].sort((a, b) =>
    a.lastName.localeCompare(b.lastName)
  )

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="dsc-label text-black/40">
              {isEditing ? 'Edit session' : 'New session'}
            </div>
            <div className="dsc-headline text-2xl text-black">
              {isEditing ? 'Adjust' : 'Add'}
            </div>
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
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
            >
              <option value="" disabled>
                Choose a trainer
              </option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          {(initial?.attendees?.length ?? 0) > 1 ? (
            <Field label={`Athletes (group of ${initial!.attendees!.length})`}>
              <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-black/5 rounded-xl">
                {initial!.attendees!.map((a) => (
                  <span
                    key={a.id}
                    className="inline-block px-2 py-0.5 rounded bg-black text-white text-xs"
                  >
                    {a.firstName} {a.lastName}
                  </span>
                ))}
              </div>
              <div className="text-xs text-black/40 mt-1">
                Group rosters can&rsquo;t be edited here yet — use the chat to
                add/remove attendees.
              </div>
            </Field>
          ) : (
            <Field label="Athlete">
              <select
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
              >
                <option value="" disabled>
                  Choose an athlete
                </option>
                {sortedAthletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="When">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
            />
          </Field>

          <Field label="Duration">
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`h-11 rounded-xl text-sm font-medium ${
                    duration === d
                      ? 'bg-black text-white'
                      : 'bg-black/5 text-black hover:bg-black/[0.08]'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex-1 h-12 rounded-full border border-red-300 text-red-700 font-semibold disabled:opacity-50"
              >
                Cancel session
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create'}
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
      <div className="dsc-label text-black/50 mb-1">{label}</div>
      {children}
    </label>
  )
}
