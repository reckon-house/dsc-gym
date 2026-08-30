'use client'

// Recovery room charges.
//
// The gym bills outside the app, so this page's job is to answer one question
// at the end of the month: who owes what. Totals first, the individual visits
// underneath as the audit trail, and a CSV so the numbers can leave.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import { RecoverySheet, type RecoveryDraft } from '../_components/RecoverySheet'

interface Visit {
  id: string
  at: string
  priceCents: number
  note: string | null
  athlete: { id: string; firstName: string; lastName: string }
}

interface Total {
  athleteId: string
  name: string
  visits: number
  totalCents: number
}

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export default function RecoveryPage() {
  const router = useRouter()
  const [month, setMonth] = useState(thisMonth)
  const [visits, setVisits] = useState<Visit[]>([])
  const [totals, setTotals] = useState<Total[]>([])
  const [grandTotalCents, setGrandTotalCents] = useState(0)
  const [defaultPriceCents, setDefaultPriceCents] = useState(2500)
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<RecoveryDraft | null>(null)
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/recovery?month=${month}`)
    const data = await res.json()
    setLoading(false)
    if (!data.success) return
    setVisits(data.data.visits)
    setTotals(data.data.totals)
    setGrandTotalCents(data.data.grandTotalCents)
    setDefaultPriceCents(data.data.defaultPriceCents ?? 2500)
  }, [month])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
    fetch('/api/athletes')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAthletes(d.data)
      })
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  const isCurrentMonth = month === thisMonth()

  function exportCsv() {
    const rows = [
      ['Date', 'Athlete', 'Charge', 'Note'],
      ...visits.map((v) => [
        new Date(v.at).toLocaleDateString('en-US'),
        `${v.athlete.firstName} ${v.athlete.lastName}`,
        (v.priceCents / 100).toFixed(2),
        v.note ?? '',
      ]),
    ]
    // Quote everything and double any embedded quotes — a note with a comma
    // would otherwise split into two columns.
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `dsc-recovery-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function savePrice() {
    setPriceError(null)
    const dollars = Number(priceInput)
    if (!Number.isFinite(dollars) || dollars < 0) {
      setPriceError('Enter a price like 25 or 25.00.')
      return
    }
    const res = await fetch('/api/admin/recovery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultPriceCents: Math.round(dollars * 100) }),
    })
    const data = await res.json()
    if (!data.success) {
      setPriceError(data.error ?? 'Could not save.')
      return
    }
    setDefaultPriceCents(data.data.defaultPriceCents)
    setEditingPrice(false)
  }

  const byDay = useMemo(() => {
    const map = new Map<string, Visit[]>()
    for (const v of visits) {
      const key = new Date(v.at).toDateString()
      map.set(key, [...(map.get(key) ?? []), v])
    }
    return [...map.entries()]
  }, [visits])

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Recovery" />
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
            aria-label="Previous month"
          >
            ←
          </button>
          <div className="text-center">
            <div className="dsc-label text-black/40">Charges</div>
            <div className="dsc-headline text-2xl md:text-3xl text-black leading-none mt-1">
              {monthLabel(month)}
            </div>
          </div>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isCurrentMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10 disabled:opacity-30"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        {/* Grand total */}
        <div className="rounded-3xl bg-black text-white p-6 mb-4">
          <div className="dsc-label text-white/50">Total billed</div>
          <div className="dsc-headline text-5xl md:text-6xl leading-none mt-1">
            {money(grandTotalCents)}
          </div>
          <div className="dsc-label text-white/50 mt-2">
            {visits.length} {visits.length === 1 ? 'visit' : 'visits'} ·{' '}
            {totals.length} {totals.length === 1 ? 'athlete' : 'athletes'}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => {
              setDraft(null)
              setSheetOpen(true)
            }}
            className="h-12 bg-black text-white rounded-full dsc-headline text-base"
          >
            + Log a visit
          </button>
          <button
            onClick={exportCsv}
            disabled={visits.length === 0}
            className="h-12 rounded-full border border-black/20 text-black/70 hover:bg-black/[0.04] font-semibold text-sm disabled:opacity-30"
          >
            Export CSV
          </button>
        </div>

        {/* Default price */}
        <div className="rounded-2xl bg-black/[0.04] px-4 py-3 mb-6 flex items-center justify-between gap-3">
          {editingPrice ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <span className="dsc-label text-black/50 shrink-0">Default</span>
                <span className="text-black/40">$</span>
                <input
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="w-20 h-9 px-2 bg-white rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={savePrice}
                  className="h-9 px-4 bg-black text-white rounded-full text-sm font-semibold"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingPrice(false)}
                  className="h-9 px-3 text-black/50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <span className="dsc-label text-black/50">Default charge</span>
                <span className="ml-2 font-semibold text-black">
                  {money(defaultPriceCents)}
                </span>
              </div>
              <button
                onClick={() => {
                  setPriceInput((defaultPriceCents / 100).toFixed(2))
                  setPriceError(null)
                  setEditingPrice(true)
                }}
                className="dsc-label text-black/50 hover:text-black shrink-0"
              >
                Change
              </button>
            </>
          )}
        </div>
        {priceError && (
          <div className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm mb-4">
            {priceError}
          </div>
        )}

        {/* Per-athlete totals — the thing being billed from. */}
        {loading ? (
          <div className="dsc-label text-black/40 text-center py-8">Loading…</div>
        ) : totals.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">Nothing logged</div>
            <p className="text-sm text-black/60">
              No recovery visits in {monthLabel(month)}.
            </p>
          </div>
        ) : (
          <>
            <div className="dsc-label text-black/40 mb-2">By athlete</div>
            <div className="space-y-2 mb-8">
              {totals.map((t) => (
                <div
                  key={t.athleteId}
                  className="rounded-2xl bg-black/[0.04] px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-black truncate">{t.name}</div>
                    <div className="dsc-label text-black/40 mt-0.5">
                      {t.visits} {t.visits === 1 ? 'visit' : 'visits'}
                    </div>
                  </div>
                  <div className="font-mono text-base text-black shrink-0">
                    {money(t.totalCents)}
                  </div>
                </div>
              ))}
            </div>

            <div className="dsc-label text-black/40 mb-2">Every visit</div>
            <div className="space-y-4">
              {byDay.map(([day, list]) => (
                <div key={day}>
                  <div className="dsc-label text-black/30 mb-1.5">
                    {new Date(day).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="space-y-1.5">
                    {list.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setDraft({
                            id: v.id,
                            athleteId: v.athlete.id,
                            at: v.at,
                            priceCents: v.priceCents,
                            note: v.note,
                          })
                          setSheetOpen(true)
                        }}
                        className="w-full rounded-2xl bg-sky-50 hover:bg-sky-100 px-4 py-3 flex items-center justify-between gap-3 text-sky-950"
                      >
                        <div className="min-w-0 text-left">
                          <div className="font-semibold truncate">
                            {v.athlete.firstName} {v.athlete.lastName}
                          </div>
                          {v.note && (
                            <div className="dsc-label opacity-60 mt-0.5 truncate">
                              {v.note}
                            </div>
                          )}
                        </div>
                        <div className="font-mono text-sm shrink-0">
                          {money(v.priceCents)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <RecoverySheet
        open={sheetOpen}
        initial={draft}
        athletes={athletes}
        defaultPriceCents={defaultPriceCents}
        onClose={() => setSheetOpen(false)}
        onSaved={load}
      />
    </div>
  )
}
