'use client'

// Ask for (coach) or enter (admin) time off. One form for both: an admin
// gets a coach picker, and what they enter is approved on save, since the
// person who would approve it is the one typing it.

import { useEffect, useState } from 'react'

interface CoachOption {
  id: string
  name: string
}

interface Stranded {
  id: string
  when: string
  who: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Present = admin mode. */
  coaches?: CoachOption[]
}

function todayYMD(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function TimeOffSheet({ open, onClose, onSaved, coaches }: Props) {
  const admin = Boolean(coaches)
  const [trainerId, setTrainerId] = useState('')
  const [start, setStart] = useState(todayYMD())
  const [end, setEnd] = useState(todayYMD())
  const [partDay, setPartDay] = useState(false)
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('12:00')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stranded, setStranded] = useState<Stranded[] | null>(null)

  useEffect(() => {
    if (!open) return
    setTrainerId(coaches?.[0]?.id ?? '')
    setStart(todayYMD())
    setEnd(todayYMD())
    setPartDay(false)
    setReason('')
    setError(null)
    setStranded(null)
    // Reset only when the sheet opens. `coaches` is usually a fresh array on
    // every parent render; depending on it would wipe the form mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const multiDay = end > start
  const coachId = trainerId || coaches?.[0]?.id || ''

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start,
          endDate: end < start ? start : end,
          ...(partDay && !multiDay ? { startMinute: toMinutes(from), endMinute: toMinutes(to) } : {}),
          reason,
          ...(admin ? { trainerId: coachId, approve: true } : {}),
        }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not save.')
        return
      }
      onSaved()
      if (admin && d.data.stranded?.length) {
        // Keep the sheet open to show what now needs covering.
        setStranded(d.data.stranded)
        return
      }
      onClose()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[88vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="dsc-label text-black/40">{admin ? 'Add time off' : 'Request time off'}</div>
            <div className="dsc-headline text-2xl text-black">Time off</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {stranded ? (
          <div className="px-5 pb-5 space-y-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Approved. These sessions are still on the books and need a different coach or a new time:
            </div>
            <div className="space-y-1.5">
              {stranded.map((s) => (
                <div key={s.id} className="rounded-2xl bg-black/[0.04] px-4 py-3 text-sm">
                  <div className="font-semibold text-black">{s.who}</div>
                  <div className="text-black/50">{s.when}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="w-full h-12 bg-black text-white rounded-full font-semibold">
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            {admin && (
              <label className="block">
                <span className="dsc-label text-black/50">Coach</span>
                <select
                  value={coachId}
                  onChange={(e) => setTrainerId(e.target.value)}
                  className="mt-1 w-full h-12 px-3 bg-black/5 rounded-xl text-black"
                >
                  {coaches!.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="dsc-label text-black/50">From</span>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value)
                    if (end < e.target.value) setEnd(e.target.value)
                  }}
                  className="mt-1 w-full h-12 px-3 bg-black/5 rounded-xl text-black"
                />
              </label>
              <label className="block">
                <span className="dsc-label text-black/50">Through</span>
                <input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full h-12 px-3 bg-black/5 rounded-xl text-black"
                />
              </label>
            </div>

            {!multiDay && (
              <label className="flex items-center gap-3 text-sm text-black/70">
                <input
                  type="checkbox"
                  checked={partDay}
                  onChange={(e) => setPartDay(e.target.checked)}
                  className="w-5 h-5 accent-black"
                />
                Only part of the day
              </label>
            )}
            {partDay && !multiDay && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full h-12 px-3 bg-black/5 rounded-xl text-black"
                  aria-label="Off from"
                />
                <input
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full h-12 px-3 bg-black/5 rounded-xl text-black"
                  aria-label="Off until"
                />
              </div>
            )}

            <label className="block">
              <span className="dsc-label text-black/50">Reason (optional)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Vacation, appointment…"
                className="mt-1 w-full h-12 px-3 bg-black/5 rounded-xl text-black"
              />
            </label>

            <p className="text-xs text-black/50">
              {admin
                ? 'Saved as approved. Nobody can book this coach then.'
                : 'Jordan or Scott will approve it. Until then your schedule is unchanged.'}
            </p>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              onClick={save}
              disabled={saving || (admin && !coachId)}
              className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {saving ? 'Saving…' : admin ? 'Save time off' : 'Send request'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
