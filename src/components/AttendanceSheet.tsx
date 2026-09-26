'use client'

// Take attendance for one session. Shared by the coach's page and the admin
// calendar so there is exactly one way to do it.
//
// Everyone starts marked present. The coach taps the kids who didn't come and
// adds anyone who turned up unbooked. That is deliberate: attendance only gets
// taken if it is nearly free, and the common case — the booked kids showed up —
// should be one tap on Save.

import { useEffect, useMemo, useState } from 'react'

interface RosterRow {
  athleteId: string
  name: string
  status: 'present' | 'no_show' | null
  dropIn: boolean
}

interface Loaded {
  id: string
  scheduledAt: string
  duration: number
  coach: string
  groupName: string | null
  takenAt: string | null
  roster: RosterRow[]
  candidates: AthleteOption[]
}

export interface AthleteOption {
  id: string
  firstName: string
  lastName: string
}

interface Props {
  sessionId: string | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function AttendanceSheet({ sessionId, open, onClose, onSaved }: Props) {
  const [data, setData] = useState<Loaded | null>(null)
  const [absent, setAbsent] = useState<Set<string>>(new Set())
  const [dropIns, setDropIns] = useState<AthleteOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !sessionId) return
    setData(null)
    setError(null)
    setDropIns([])
    setLoading(true)
    fetch(`/api/sessions/${sessionId}/attendance`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          setError(d.error ?? 'Could not load this session.')
          return
        }
        setData(d.data)
        // Re-opening a session shows what was recorded; a fresh one starts
        // with everyone present.
        setAbsent(
          new Set(
            (d.data.roster as RosterRow[])
              .filter((r) => r.status === 'no_show')
              .map((r) => r.athleteId)
          )
        )
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoading(false))
  }, [open, sessionId])

  const addable = useMemo(() => {
    const taken = new Set([...(data?.roster ?? []).map((r) => r.athleteId), ...dropIns.map((d) => d.id)])
    return (data?.candidates ?? []).filter((a) => !taken.has(a.id))
  }, [data, dropIns])

  if (!open) return null

  function toggle(id: string) {
    setAbsent((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!data) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/sessions/${data.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marks: data.roster.map((row) => ({
            athleteId: row.athleteId,
            status: absent.has(row.athleteId) ? 'no_show' : 'present',
          })),
          dropIns: dropIns.map((d) => d.id),
        }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not save attendance.')
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

  const when = data
    ? new Date(data.scheduledAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''
  const presentCount = data ? data.roster.length - absent.size + dropIns.length : 0

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
          <div className="min-w-0">
            <div className="dsc-label text-black/40">Attendance{data?.takenAt ? ' · recorded' : ''}</div>
            <div className="dsc-headline text-2xl text-black truncate">
              {data?.groupName ?? 'Who came?'}
            </div>
            {data && (
              <div className="dsc-label text-black/40 mt-0.5">
                {when} · {data.coach}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {loading && <div className="dsc-label text-black/40 py-6 text-center">Loading…</div>}

          {data && (
            <>
              <p className="text-xs text-black/50">
                Everyone starts as here. Tap anyone who didn&rsquo;t come.
              </p>

              {data.roster.length === 0 && dropIns.length === 0 && (
                <div className="rounded-2xl bg-black/[0.04] px-4 py-3 text-sm text-black/60">
                  Nobody was booked. Add anyone who came below.
                </div>
              )}

              <div className="space-y-1.5">
                {data.roster.map((row) => {
                  const gone = absent.has(row.athleteId)
                  return (
                    <button
                      key={row.athleteId}
                      type="button"
                      onClick={() => toggle(row.athleteId)}
                      className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 h-14 text-left transition-colors ${
                        gone ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-950'
                      }`}
                    >
                      <span className="font-semibold truncate">
                        {row.name}
                        {row.dropIn && <span className="dsc-label opacity-60 ml-2">drop-in</span>}
                      </span>
                      <span className="dsc-label shrink-0">{gone ? 'No-show' : 'Here'}</span>
                    </button>
                  )
                })}
                {dropIns.map((d) => (
                  <div
                    key={d.id}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 h-14 bg-emerald-50 text-emerald-950"
                  >
                    <span className="font-semibold truncate">
                      {d.firstName} {d.lastName}
                      <span className="dsc-label opacity-60 ml-2">drop-in</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDropIns((prev) => prev.filter((x) => x.id !== d.id))}
                      className="dsc-label opacity-60 hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <select
                value=""
                onChange={(e) => {
                  const a = data.candidates.find((x) => x.id === e.target.value)
                  if (a) setDropIns((prev) => [...prev, a])
                }}
                className="w-full h-12 px-3 bg-black/5 rounded-xl text-black"
              >
                <option value="">+ Someone came who wasn&rsquo;t booked…</option>
                {addable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {data && (
            <button
              onClick={save}
              disabled={saving}
              className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {saving
                ? 'Saving…'
                : `Save — ${presentCount} here${absent.size ? `, ${absent.size} no-show` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
