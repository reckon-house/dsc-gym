'use client'

import { useEffect, useState } from 'react'

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

export interface TrainerSessionDraft {
  id?: string // existing session id, for edit mode
  athleteId?: string
  scheduledAt?: string // ISO
  duration?: number
}

interface Props {
  open: boolean
  initial: TrainerSessionDraft | null
  athletes: AthleteOpt[]
  onClose: () => void
  onSaved: () => void
}

const DURATIONS = [30, 45, 60, 90]

function defaultWhen(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toLocalDatetimeInput(iso: string | undefined): string {
  if (!iso) return defaultWhen()
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TrainerScheduleSheet({
  open,
  initial,
  athletes,
  onClose,
  onSaved,
}: Props) {
  const [athleteId, setAthleteId] = useState('')
  const [when, setWhen] = useState(defaultWhen())
  const [duration, setDuration] = useState<number>(60)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setAthleteId(initial?.athleteId ?? '')
    setWhen(toLocalDatetimeInput(initial?.scheduledAt))
    setDuration(initial?.duration ?? 60)
    setNotes('')
    setError(null)
  }, [open, initial])

  if (!open) return null

  const sortedAthletes = [...athletes].sort((a, b) =>
    a.lastName.localeCompare(b.lastName)
  )

  async function handleSave() {
    setError(null)
    if (!athleteId || !when) {
      setError('Pick an athlete and a time.')
      return
    }
    setSaving(true)
    try {
      const body = {
        athleteId,
        scheduledAt: new Date(when).toISOString(),
        duration,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }
      const url = isEditing ? `/api/sessions/${initial!.id}` : '/api/sessions'
      const method = isEditing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not save.')
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
      const res = await fetch(`/api/sessions/${initial!.id}`, { method: 'DELETE' })
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[90vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="dsc-label text-black/40">
              {isEditing ? 'Edit session' : 'New session'}
            </div>
            <div className="dsc-headline text-2xl text-black">
              {isEditing ? 'Adjust' : 'Schedule'}
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
          <label className="block">
            <div className="dsc-label text-black/50 mb-1">Athlete</div>
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
          </label>

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">When</div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
            />
          </label>

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">Duration</div>
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
          </label>

          {!isEditing && (
            <label className="block">
              <div className="dsc-label text-black/50 mb-1">Notes (optional)</div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to remember"
                className="w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/40"
              />
            </label>
          )}

          {error && (
            <div className="bg-red-50 rounded-2xl px-4 py-3 flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0" />
              <div className="text-sm text-red-900 leading-snug">{error}</div>
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
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
