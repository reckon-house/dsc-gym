'use client'

// Create, edit or cancel a company-calendar meeting.
//
// Mirrors SessionEditSheet's chrome so the two feel like the same calendar.
// The one meaningful difference: staff selection is a multi-select where
// picking nobody means "all staff" — the common case for a team meeting, and
// the case that blocks the whole floor from being booked.

import { useEffect, useState } from 'react'

interface TrainerOpt {
  id: string
  name: string
}

export interface MeetingDraft {
  id?: string
  title?: string
  description?: string | null
  startsAt?: string
  duration?: number
  trainerIds?: string[]
}

interface Props {
  open: boolean
  initial: MeetingDraft | null
  trainers: TrainerOpt[]
  onClose: () => void
  onSaved: () => void
}

const DURATIONS = [30, 60, 90, 120]

function toLocalDatetimeInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MeetingSheet({ open, initial, trainers, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState(60)
  const [trainerIds, setTrainerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Clashes are shown, never enforced — see the POST route's comment.
  const [warnings, setWarnings] = useState<string[]>([])
  const isEditing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setWhen(toLocalDatetimeInput(initial?.startsAt))
    setDuration(initial?.duration ?? 60)
    setTrainerIds(initial?.trainerIds ?? [])
    setError(null)
    setWarnings([])
  }, [open, initial])

  if (!open) return null

  function toggleTrainer(id: string) {
    setTrainerIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    setError(null)
    setWarnings([])
    if (!title.trim() || !when) {
      setError('A meeting needs a title and a time.')
      return
    }
    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        startsAt: new Date(when).toISOString(),
        duration,
        trainerIds,
      }
      const res = await fetch(
        isEditing ? `/api/admin/calendar-events/${initial!.id}` : '/api/admin/calendar-events',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not save the meeting.')
        return
      }
      // Overlaps don't stop the save, so surface them and keep the sheet open
      // long enough for the owner to read them.
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setWarnings(data.warnings)
        onSaved()
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelMeeting() {
    if (!initial?.id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/calendar-events/${initial.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not cancel the meeting.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Could not reach the server.')
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
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[85vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="dsc-label text-black/40">
              {isEditing ? 'Edit meeting' : 'New meeting'}
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
          <Field label="What">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Staff meeting"
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30"
            />
          </Field>

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

          <Field label="Who">
            <div className="flex flex-wrap gap-1.5">
              {trainers.map((t) => {
                const on = trainerIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTrainer(t.id)}
                    className={`px-3 h-9 rounded-full text-sm font-medium ${
                      on ? 'bg-black text-white' : 'bg-black/5 text-black hover:bg-black/[0.08]'
                    }`}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
            <div className="text-xs text-black/40 mt-1.5">
              {trainerIds.length === 0
                ? 'Nobody picked — this counts as all staff, and blocks the whole floor.'
                : `${trainerIds.length} ${trainerIds.length === 1 ? 'person' : 'people'} — only they get blocked.`}
            </div>
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              <div className="font-semibold mb-1">Saved — but note the overlap:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <button
                onClick={onClose}
                className="mt-2 underline underline-offset-2 font-semibold"
              >
                Got it
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                onClick={handleCancelMeeting}
                disabled={saving}
                className="flex-1 h-12 rounded-full border border-red-300 text-red-700 font-semibold disabled:opacity-50"
              >
                Cancel meeting
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
