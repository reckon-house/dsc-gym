'use client'

// Owners only. Three questions: what did we make, who owes us, what do we
// charge. Payment itself happens outside the app — this is the ledger.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import { PaymentSheet } from '@/components/PaymentSheet'
import { money } from '@/lib/formatMoney'

type Tab = 'revenue' | 'owed' | 'prices'


function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return r.json().catch(() => ({ success: false, error: 'Could not reach the server.' }))
}

export default function MoneyPage() {
  const router = useRouter()
  const [ok, setOk] = useState(false)
  const [tab, setTab] = useState<Tab>('revenue')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
        else if (!d.user.isOwner) router.replace('/admin')
        else setOk(true)
      })
  }, [router])

  if (!ok) return null
  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Money" />
      <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-4">
        <div className="flex gap-1.5">
          {(
            [
              ['revenue', 'Revenue'],
              ['owed', 'Who owes'],
              ['prices', 'Prices'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`h-10 px-4 rounded-full text-sm font-semibold ${tab === k ? 'bg-black text-white' : 'bg-black/5 text-black/70'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'revenue' && <Revenue />}
        {tab === 'owed' && <Owed />}
        {tab === 'prices' && <Prices />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ revenue

interface Report {
  earnedCents: number
  confirmedCents: number
  estimatedCents: number
  noShowCents: number
  recoveryCents: number
  collectedCents: number
  visits: number
  estimatedVisits: number
  compVisits: number
  unpricedVisits: number
  coachHours: number
  perCoachHourCents: number | null
  byClassType: { classType: string; label: string; earnedCents: number; visits: number; sessions: number; hours: number; perHourCents: number | null }[]
  byCoach: { trainerId: string; name: string; earnedCents: number; sessions: number; hours: number; perHourCents: number | null }[]
  byClass: { key: string; label: string; earnedCents: number; sessions: number; avgPerSessionCents: number; avgAthletes: number }[]
}

function rangeFor(kind: 'week' | 'month' | 'last_month'): [string, string] {
  const now = new Date()
  if (kind === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
    return [ymd(start), ymd(now)]
  }
  if (kind === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)]
  return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))]
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] p-4">
      <div className="dsc-label text-black/50">{label}</div>
      <div className="dsc-headline text-2xl text-black mt-1">{value}</div>
      {sub && <div className="text-xs text-black/50 mt-0.5">{sub}</div>}
    </div>
  )
}

function Revenue() {
  const [preset, setPreset] = useState<'week' | 'month' | 'last_month' | 'custom'>('month')
  const [range, setRange] = useState<[string, string]>(() => rangeFor('month'))
  const [r, setR] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/owner/revenue?from=${range[0]}&to=${range[1]}`)
      .then((x) => x.json())
      .then((d) => {
        setError(d.success ? null : d.error)
        if (d.success) setR(d.data)
      })
      .catch(() => setError('Could not reach the server.'))
  }, [range])

  const hours = (h: number) => `${Math.round(h * 10) / 10} h`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 items-center">
        {(
          [
            ['week', 'This week'],
            ['month', 'This month'],
            ['last_month', 'Last month'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setPreset(k)
              setRange(rangeFor(k))
            }}
            className={`h-9 px-3 rounded-full text-sm ${preset === k ? 'bg-black text-white' : 'bg-black/5 text-black/70'}`}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          value={range[0]}
          onChange={(e) => {
            setPreset('custom')
            setRange([e.target.value, range[1]])
          }}
          className="h-9 px-2 bg-black/5 rounded-full text-sm"
          aria-label="From"
        />
        <input
          type="date"
          value={range[1]}
          onChange={(e) => {
            setPreset('custom')
            setRange([range[0], e.target.value])
          }}
          className="h-9 px-2 bg-black/5 rounded-full text-sm"
          aria-label="To"
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!r ? (
        <div className="dsc-label text-black/40 py-6 text-center">Loading…</div>
      ) : (
        <>
          {r.unpricedVisits > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-950">
              {r.unpricedVisits} visit{r.unpricedVisits === 1 ? ' has' : 's have'} no price yet, so they&rsquo;re not
              counted. Add rates on the Prices tab.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Earned"
              value={money(r.earnedCents + r.recoveryCents)}
              sub={`${r.visits} visits${r.recoveryCents ? ` · incl. ${money(r.recoveryCents)} recovery` : ''}`}
            />
            <Stat label="Collected" value={money(r.collectedCents)} sub="Payments recorded" />
            <Stat label="Per coach hour" value={money(r.perCoachHourCents)} sub={`${hours(r.coachHours)} coached`} />
            <Stat
              label="Not confirmed"
              value={money(r.estimatedCents)}
              sub={`${r.estimatedVisits} visits with no attendance taken`}
            />
          </div>
          <p className="text-xs text-black/50">
            Earned = athletes who came × today&rsquo;s prices
            {r.noShowCents ? `, including ${money(r.noShowCents)} of charged no-shows` : ''}.
            {r.compVisits ? ` ${r.compVisits} comped visits not counted.` : ''} Monthly members&rsquo; visits are valued at
            the session rate.
          </p>

          <Section title="By class type">
            {r.byClassType.map((t) => (
              <Line
                key={t.classType}
                left={t.label}
                sub={`${t.sessions} sessions · ${t.visits} visits · ${hours(t.hours)}`}
                right={money(t.earnedCents)}
                rightSub={`${money(t.perHourCents)}/h`}
              />
            ))}
          </Section>
          <Section title="By coach">
            {r.byCoach.map((c) => (
              <Line
                key={c.trainerId}
                left={c.name}
                sub={`${c.sessions} sessions · ${hours(c.hours)}`}
                right={money(c.earnedCents)}
                rightSub={`${money(c.perHourCents)}/h`}
              />
            ))}
          </Section>
          <Section title="By class">
            {r.byClass.map((k) => (
              <Line
                key={k.key}
                left={k.label}
                sub={`${k.sessions} sessions · avg ${k.avgAthletes} athletes`}
                right={money(k.earnedCents)}
                rightSub={`${money(k.avgPerSessionCents)}/session`}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0
  return (
    <div>
      <div className="dsc-label text-black/50 mb-2">{title}</div>
      {empty ? <p className="text-sm text-black/40">Nothing in this period.</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

function Line({ left, sub, right, rightSub }: { left: string; sub?: string; right: string; rightSub?: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-black truncate">{left}</div>
        {sub && <div className="text-xs text-black/50 truncate">{sub}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="font-semibold text-black">{right}</div>
        {rightSub && <div className="text-xs text-black/50">{rightSub}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ owed

interface Balance {
  athleteId: string
  name: string
  plan: 'per_session' | 'monthly' | 'comp'
  owedCents: number
  chargesCents: number
  paidCents: number
  visits: number
  estimatedVisits: number
  unpricedVisits: number
  paidThrough: string | null
  daysBehind: number | null
  lastPaymentOn: string | null
  behind: boolean
}

function Owed() {
  const [data, setData] = useState<{ startedOn: string | null; rows: Balance[] } | null>(null)
  const [paying, setPaying] = useState<Balance | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [startDate, setStartDate] = useState(ymd(new Date()))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/owner/balances')
      .then((r) => r.json())
      .then((d) => d.success && setData(d.data))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const behind = useMemo(() => (data?.rows ?? []).filter((r) => r.behind), [data])
  const totalOwed = behind.filter((r) => r.plan === 'per_session').reduce((s, r) => s + r.owedCents, 0)
  const rows = showAll ? (data?.rows ?? []).filter((r) => r.plan !== 'comp') : behind

  async function start() {
    const d = await send('/api/owner/settings', 'PATCH', { billingStartDate: startDate })
    if (!d.success) setError(d.error)
    else load()
  }

  if (!data) return <div className="dsc-label text-black/40 py-6 text-center">Loading…</div>

  return (
    <div className="space-y-3">
      {!data.startedOn && (
        <div className="rounded-2xl bg-black/[0.04] p-4 space-y-2">
          <div className="font-semibold text-black">Start tracking balances</div>
          <p className="text-sm text-black/60">
            Per-session families owe for each visit from this date on. Nothing before it is billed, so history
            doesn&rsquo;t turn into fake debts. Monthly members are tracked by their paid-through date either way.
          </p>
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 px-3 bg-white rounded-xl" />
            <button onClick={start} className="h-10 px-4 bg-black text-white rounded-full text-sm font-semibold">
              Start from this date
            </button>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Behind" value={String(behind.length)} sub="families to follow up" />
        <Stat label="Owed (per session)" value={money(totalOwed)} sub={data.startedOn ? `since ${data.startedOn}` : 'not started'} />
      </div>

      <div className="flex items-center justify-between">
        <div className="dsc-label text-black/50">{showAll ? 'Everyone' : 'Behind'}</div>
        <button onClick={() => setShowAll((v) => !v)} className="dsc-label text-black/50 hover:text-black">
          {showAll ? 'Only who’s behind' : 'Show everyone'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-black/[0.04] p-8 text-center text-sm text-black/60">Nobody is behind.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.athleteId} className="rounded-2xl bg-black/[0.04] px-4 py-3 flex items-center justify-between gap-3">
              <Link href={`/admin/athletes/${r.athleteId}`} className="min-w-0">
                <div className="font-semibold text-black truncate">{r.name}</div>
                <div className="text-xs text-black/50 truncate">
                  {r.plan === 'monthly'
                    ? r.paidThrough
                      ? `Monthly · paid through ${r.paidThrough}${r.daysBehind ? ` · ${r.daysBehind} days behind` : ''}`
                      : 'Monthly · no payment recorded'
                    : `${r.visits} visits${r.estimatedVisits ? ` (${r.estimatedVisits} not confirmed)` : ''} · paid ${money(r.paidCents)}`}
                  {r.unpricedVisits ? ` · ${r.unpricedVisits} unpriced` : ''}
                </div>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                {r.plan === 'per_session' && (
                  <span className={`font-semibold ${r.owedCents > 0 ? 'text-red-700' : 'text-black/50'}`}>
                    {r.owedCents > 0 ? money(r.owedCents) : r.owedCents < 0 ? `${money(-r.owedCents)} credit` : 'Paid up'}
                  </span>
                )}
                <button onClick={() => setPaying(r)} className="h-9 px-3 rounded-full bg-black text-white text-xs font-semibold">
                  Record payment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paying && (
        <PaymentSheet
          athleteId={paying.athleteId}
          name={paying.name}
          plan={paying.plan}
          suggestCents={paying.plan === 'per_session' && paying.owedCents > 0 ? paying.owedCents : null}
          paidThrough={paying.paidThrough}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ prices

interface Item {
  id: string
  name: string
  classType: string | null
  durationMinutes: number | null
  priceCents: number
  unit: string
  sessionsIncluded: number | null
  description: string | null
  isPublic: boolean
  active: boolean
}

const TYPE_OPTS = [
  { v: 'private', l: 'Private' },
  { v: 'semi_private', l: 'Semi-private' },
  { v: 'group', l: 'Group' },
  { v: '', l: 'Other' },
]

function Prices() {
  const [data, setData] = useState<{
    items: Item[]
    groups: { id: string; name: string; priceCents: number | null }[]
    settings: { billingStartDate: string | null; pricingNote: string | null; chargeNoShows: boolean }
  } | null>(null)
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/owner/prices')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d.data)
          setNote(d.data.settings.pricingNote ?? '')
        }
      })
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (!data) return <div className="dsc-label text-black/40 py-6 text-center">Loading…</div>

  const rates = data.items.filter((i) => i.classType && i.unit === 'session')
  const missing = TYPE_OPTS.filter((t) => t.v && !rates.some((r) => r.classType === t.v && r.active))
  const publicCount = data.items.filter((i) => i.isPublic && i.active).length

  async function saveGroupPrice(id: string, v: string) {
    const d = await send(`/api/owner/groups/${id}`, 'PATCH', { price: v.trim() === '' ? null : v })
    setMsg(d.success ? 'Saved.' : d.error)
    load()
  }

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-950">
          No session price yet for: {missing.map((m) => m.l).join(', ')}. Revenue and balances skip those visits until
          there is one.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="dsc-label text-black/50">Price sheet</div>
          <button onClick={() => setEditing('new')} className="h-9 px-4 rounded-full bg-black text-white text-sm font-semibold">
            + Add price
          </button>
        </div>
        {data.items.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-6 text-sm text-black/60">
            Start with the three session rates — Private, Semi-private and Group. Add packages or memberships too if you
            want families to see them.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.items.map((i) => (
              <button
                key={i.id}
                onClick={() => setEditing(i)}
                className={`w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${i.active ? 'bg-black/[0.04]' : 'bg-black/[0.02] opacity-50'}`}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-black truncate">{i.name}</div>
                  <div className="text-xs text-black/50">
                    {i.classType ? `${TYPE_OPTS.find((t) => t.v === i.classType)?.l} rate` : 'Display only'}
                    {i.durationMinutes ? ` · ${i.durationMinutes} min` : ''}
                    {i.isPublic ? ' · shown to families' : ' · hidden'}
                    {!i.active ? ' · off' : ''}
                  </div>
                </div>
                <div className="font-semibold text-black shrink-0">
                  {money(i.priceCents)}
                  <span className="text-xs text-black/50 font-normal">
                    {i.unit === 'session' ? '/session' : i.unit === 'month' ? '/month' : i.sessionsIncluded ? ` / ${i.sessionsIncluded}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-black/50 mt-2">
          {publicCount
            ? `${publicCount} line${publicCount === 1 ? ' is' : 's are'} on the public price page.`
            : 'Nothing is public yet, so the price page stays hidden from families.'}{' '}
          <Link href="/pricing" className="underline" target="_blank">
            View price page
          </Link>
        </p>
      </div>

      <div>
        <div className="dsc-label text-black/50 mb-1">Note under the public prices</div>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Team rates on request" className="flex-1 h-11 px-3 bg-black/5 rounded-xl" />
          <button
            onClick={async () => {
              const d = await send('/api/owner/settings', 'PATCH', { pricingNote: note })
              setMsg(d.success ? 'Saved.' : d.error)
            }}
            className="h-11 px-4 rounded-full bg-black/10 text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </div>

      {data.groups.length > 0 && (
        <div>
          <div className="dsc-label text-black/50 mb-1">Group prices (per athlete, per session)</div>
          <p className="text-xs text-black/50 mb-2">Leave blank to use the Group rate above.</p>
          <div className="space-y-1.5">
            {data.groups.map((g) => (
              <GroupPrice key={g.id} name={g.name} cents={g.priceCents} onSave={(v) => saveGroupPrice(g.id, v)} />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-black/[0.04] p-4 space-y-2">
        <label className="flex items-center gap-3 text-sm text-black">
          <input
            type="checkbox"
            checked={data.settings.chargeNoShows}
            onChange={async (e) => {
              await send('/api/owner/settings', 'PATCH', { chargeNoShows: e.target.checked })
              load()
            }}
            className="w-4 h-4 accent-black"
          />
          Charge for no-shows
        </label>
        <div className="text-sm text-black/60">
          Balances count from {data.settings.billingStartDate ?? 'not started yet'}.{' '}
          {data.settings.billingStartDate && (
            <button
              onClick={async () => {
                const v = prompt('Count balances from (YYYY-MM-DD):', data.settings.billingStartDate ?? '')
                if (v === null) return
                const d = await send('/api/owner/settings', 'PATCH', { billingStartDate: v })
                setMsg(d.success ? 'Saved.' : d.error)
                load()
              }}
              className="underline"
            >
              Change
            </button>
          )}
        </div>
      </div>
      {msg && <p className="text-sm text-black/60">{msg}</p>}

      {editing && (
        <PriceSheet
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function GroupPrice({ name, cents, onSave }: { name: string; cents: number | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(cents === null ? '' : String(cents / 100))
  return (
    <div className="rounded-2xl bg-black/[0.04] px-4 py-2 flex items-center justify-between gap-3">
      <span className="font-semibold text-black truncate">{name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-black/40">$</span>
        <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder="Group rate" className="w-24 h-9 px-2 bg-white rounded-lg text-sm" />
        <button
          onClick={() => onSave(v)}
          disabled={v === (cents === null ? '' : String(cents / 100))}
          className="h-9 px-3 rounded-full bg-black text-white text-xs font-semibold disabled:bg-black/20"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function PriceSheet({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item ? String(item.priceCents / 100) : '')
  const [classType, setClassType] = useState(item?.classType ?? 'private')
  const [unit, setUnit] = useState(item?.unit ?? 'session')
  const [duration, setDuration] = useState(item?.durationMinutes ? String(item.durationMinutes) : '')
  const [sessions, setSessions] = useState(item?.sessionsIncluded ? String(item.sessionsIncluded) : '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [isPublic, setIsPublic] = useState(item?.isPublic ?? true)
  const [active, setActive] = useState(item?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    const body = {
      name,
      price,
      classType: unit === 'session' ? classType || null : null,
      unit,
      durationMinutes: duration || null,
      sessionsIncluded: unit === 'package' ? sessions || null : null,
      description,
      isPublic,
      active,
    }
    const d = item ? await send(`/api/owner/prices/${item.id}`, 'PATCH', body) : await send('/api/owner/prices', 'POST', body)
    setBusy(false)
    if (!d.success) setError(d.error ?? 'Could not save.')
    else onSaved()
  }

  async function remove() {
    if (!item || !confirm(`Delete "${item.name}"? Revenue will be re-priced without it.`)) return
    await send(`/api/owner/prices/${item.id}`, 'DELETE')
    onSaved()
  }

  const pill = (on: boolean) => `h-9 px-3 rounded-full text-sm ${on ? 'bg-black text-white' : 'bg-black/5 text-black/70'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[90vh] overflow-y-auto dsc-sheet-panel p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="dsc-headline text-2xl text-black">{item ? 'Edit price' : 'New price'}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/5 text-black/60" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['session', 'Per session'],
            ['package', 'Package'],
            ['month', 'Monthly'],
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setUnit(v)} className={pill(unit === v)}>
              {l}
            </button>
          ))}
        </div>
        {unit === 'session' && (
          <div>
            <div className="dsc-label text-black/50 mb-1">Class type</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTS.map((t) => (
                <button key={t.v} type="button" onClick={() => setClassType(t.v)} className={pill(classType === t.v)}>
                  {t.l}
                </button>
              ))}
            </div>
            <p className="text-xs text-black/50 mt-1">
              Private = 1 athlete, semi-private = 2–3, group = 4+ or any named group. Used to price visits.
            </p>
          </div>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Private session" className="w-full h-11 px-3 bg-black/5 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="dsc-label text-black/50">Price ($){unit === 'session' && classType && classType !== 'private' ? ' per athlete' : ''}</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="mt-1 w-full h-11 px-3 bg-black/5 rounded-xl" />
          </label>
          {unit === 'package' ? (
            <label className="block">
              <span className="dsc-label text-black/50">Sessions</span>
              <input value={sessions} onChange={(e) => setSessions(e.target.value)} inputMode="numeric" className="mt-1 w-full h-11 px-3 bg-black/5 rounded-xl" />
            </label>
          ) : (
            <label className="block">
              <span className="dsc-label text-black/50">Length (min, opt.)</span>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" placeholder="Any" className="mt-1 w-full h-11 px-3 bg-black/5 rounded-xl" />
            </label>
          )}
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line for families (optional)" className="w-full h-11 px-3 bg-black/5 rounded-xl" />
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-black" />
          Show on the families&rsquo; price page
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-black" />
          In use
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button onClick={save} disabled={busy || !name.trim() || !price} className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30">
          {busy ? 'Saving…' : 'Save'}
        </button>
        {item && (
          <button onClick={remove} className="w-full dsc-label text-red-700/60 hover:text-red-700 py-2">
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
