'use client'

// Log a recovery-room visit, or remove one logged by mistake.
//
// Money is handled in cents everywhere below the UI; this sheet is the only
// place that converts to and from dollars, so rounding happens once.

import { useEffect, useMemo, useState } from 'react'

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

export interface RecoveryDraft {
  id?: string
  athleteId?: string
  at?: string
  priceCents?: number
  note?: string | null
}

interface Props {
  open: boolean
  initial: RecoveryDraft | null
  athletes: AthleteOpt[]
  defaultPriceCents: number
  onClose: () => void
  onSaved: () => void
}

function toLocalDatetimeInput(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RecoverySheet({
  open,
  initial,
  athletes,
  defaultPriceCents,
  onClose,
  onSaved,
}: Props) {
  const [athleteId, setAthleteId] = useState('')
  const [when, setWhen] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setAthleteId(initial?.athleteId ?? '')
    setWhen(toLocalDatetimeInput(initial?.at))
    setPrice(((initial?.priceCents ?? defaultPriceCents) / 100).toFixed(2))
    setNote(initial?.note ?? '')
    setError(null)
  }, [open, initial, defaultPriceCents])

  const sorted = useMemo(
    () => [...athletes].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [athletes]
  )

  if (!open) return null

  async function handleSave() {
    setError(null)
    if (!athleteId) {
      setError('Pick an athlete.')
      return
    }
    const dollars = Number(price)
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError('Enter a price like 25 or 25.00.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          at: new Date(when).toISOString(),
          priceCents: Math.round(dollars * 100),
          note: note.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not log the visit.')
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

  async function handleDelete() {
    if (!initial?.id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/recovery/${initial.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not remove the charge.')
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
            <div className="dsc-label text-black/40">Recovery room</div>
            <div className="dsc-headline text-2xl text-black">
              {isEditing ? 'Charge' : 'Log a visit'}
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
          <Field label="Who">
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={isEditing}
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black disabled:opacity-60"
            >
              <option value="" disabled>
                Choose an athlete
              </option>
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="When">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              disabled={isEditing}
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black disabled:opacity-60"
            />
          </Field>

          <Field label="Charge">
            <div className="flex items-center gap-2">
              <span className="dsc-headline text-xl text-black/40">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isEditing}
                className="flex-1 h-11 px-3 bg-black/5 rounded-xl text-black disabled:opacity-60"
              />
            </div>
            {!isEditing && (
              <div className="text-xs text-black/40 mt-1">
                Default is ${(defaultPriceCents / 100).toFixed(2)} — change it here for a
                one-off.
              </div>
            )}
          </Field>

          <Field label="Note">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isEditing}
              placeholder="Optional"
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30 disabled:opacity-60"
            />
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing ? (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 h-12 rounded-full border border-red-300 text-red-700 font-semibold disabled:opacity-50"
              >
                {saving ? 'Removing…' : 'Remove charge'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
              >
                {saving ? 'Saving…' : 'Log visit'}
              </button>
            )}
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
