'use client'

// "Check someone in" — type two letters, tap the name, done. Lives at the top
// of the admin and coach home screens so it's always one tap away.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

interface TodayRow {
  id: string
  athleteId: string
  name: string
  time: string
  session: string | null
  kiosk: boolean
}

export function QuickCheckIn() {
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [today, setToday] = useState<TodayRow[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ text: string; checkInId?: string; tone: 'ok' | 'info' | 'error' } | null>(null)
  const [showList, setShowList] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/checkins')
    const d = await r.json().catch(() => null)
    if (d?.success) {
      setAthletes(d.data.athletes)
      setToday(d.data.today)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const here = useMemo(() => new Set(today.map((t) => t.athleteId)), [today])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const words = needle.split(/\s+/)
    return athletes
      .filter((a) => {
        const full = `${a.firstName} ${a.lastName}`.toLowerCase()
        return words.every((w) => full.split(' ').some((part) => part.startsWith(w)) || full.includes(w))
      })
      .slice(0, 6)
  }, [q, athletes])

  async function checkIn(a: AthleteOpt) {
    setBusy(a.id)
    try {
      const r = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId: a.id }),
      })
      const d = await r.json()
      if (!d.success) {
        setFlash({ text: d.error ?? 'Could not check in.', tone: 'error' })
        return
      }
      const res = d.data
      setFlash(
        res.already
          ? { text: `${res.name} is already checked in.`, tone: 'info' }
          : {
              text: `✓ ${res.name} checked in${res.session ? ` · ${res.session}` : ' · nothing booked today'}`,
              checkInId: res.checkInId,
              tone: 'ok',
            }
      )
      setQ('')
      inputRef.current?.focus()
      load()
    } catch {
      setFlash({ text: 'Could not reach the server.', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function undo(id: string) {
    await fetch(`/api/checkins/${id}`, { method: 'DELETE' })
    setFlash({ text: 'Undone.', tone: 'info' })
    load()
  }

  return (
    <div className="rounded-3xl bg-black/[0.04] p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="dsc-label text-black/50">Check in</div>
        {today.length > 0 && (
          <button onClick={() => setShowList((v) => !v)} className="dsc-label text-black/50 hover:text-black">
            Here today · {today.length} {showList ? '▲' : '▼'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches.length === 1) checkIn(matches[0])
        }}
        placeholder="Type a name…"
        autoComplete="off"
        className="w-full h-12 px-4 bg-white rounded-2xl text-black text-base placeholder:text-black/30"
      />

      {matches.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {matches.map((a) => (
            <button
              key={a.id}
              onClick={() => checkIn(a)}
              disabled={busy !== null}
              className="w-full h-12 px-4 rounded-2xl bg-white hover:bg-emerald-50 flex items-center justify-between text-left disabled:opacity-50"
            >
              <span className="font-semibold text-black truncate">
                {a.firstName} {a.lastName}
              </span>
              <span className="dsc-label shrink-0 text-black/40">
                {busy === a.id ? 'Checking in…' : here.has(a.id) ? 'Already here' : 'Check in'}
              </span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && matches.length === 0 && (
        <p className="text-sm text-black/50 mt-2">Nobody by that name. New families sign up at the kiosk or get added as a lead.</p>
      )}

      {flash && (
        <div
          className={`mt-2 rounded-2xl px-4 py-2.5 text-sm flex items-center justify-between gap-3 ${
            flash.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-950'
              : flash.tone === 'error'
                ? 'bg-red-50 text-red-900'
                : 'bg-white text-black/70'
          }`}
        >
          <span className="min-w-0">{flash.text}</span>
          {flash.checkInId && (
            <button onClick={() => undo(flash.checkInId!)} className="dsc-label shrink-0 opacity-70 hover:opacity-100">
              Undo
            </button>
          )}
        </div>
      )}

      {showList && (
        <div className="mt-2 space-y-1">
          {today.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm px-1">
              <span className="text-black truncate">
                {t.name}
                <span className="text-black/40">{t.session ? ` · ${t.session}` : ' · drop-in visit'}</span>
              </span>
              <span className="dsc-label text-black/40 shrink-0">
                {t.time}
                {t.kiosk ? ' · kiosk' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
