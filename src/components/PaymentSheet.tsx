'use client'

// Record a payment made outside the app (Venmo, cash, …). Shared by the Money
// page and the athlete profile's billing card.

import { useMemo, useState } from 'react'

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

export function PaymentSheet({
  athleteId,
  name,
  plan,
  suggestCents,
  paidThrough,
  onClose,
  onSaved,
}: {
  athleteId: string
  name: string
  plan: string
  suggestCents: number | null
  paidThrough: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const nextMonth = useMemo(() => {
    const base = paidThrough ? new Date(`${paidThrough}T12:00:00`) : new Date()
    const d = new Date(base)
    d.setMonth(d.getMonth() + 1)
    if (!paidThrough) d.setDate(d.getDate() - 1)
    return ymd(d)
  }, [paidThrough])
  const [amount, setAmount] = useState(suggestCents ? String(suggestCents / 100) : '')
  const [paidOn, setPaidOn] = useState(ymd(new Date()))
  const [method, setMethod] = useState('venmo')
  const [note, setNote] = useState('')
  const [covers, setCovers] = useState(plan === 'monthly' ? nextMonth : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const d = await send('/api/owner/payments', 'POST', { athleteId, amount, paidOn, method, note, coversThrough: covers || null })
    setBusy(false)
    if (!d.success) setError(d.error ?? 'Could not save.')
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[88vh] overflow-y-auto dsc-sheet-panel p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="dsc-label text-black/40">Record payment</div>
            <div className="dsc-headline text-2xl text-black">{name}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/5 text-black/60" aria-label="Close">
            ✕
          </button>
        </div>
        <label className="block">
          <span className="dsc-label text-black/50">Amount ($)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus className="mt-1 w-full h-12 px-3 bg-black/5 rounded-xl text-lg" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {['venmo', 'zelle', 'cash', 'card', 'check', 'other'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`h-9 px-3 rounded-full text-sm capitalize ${method === m ? 'bg-black text-white' : 'bg-black/5 text-black/70'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="dsc-label text-black/50">Paid on</span>
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="mt-1 w-full h-11 px-3 bg-black/5 rounded-xl" />
          </label>
          <label className="block">
            <span className="dsc-label text-black/50">{plan === 'monthly' ? 'Covers through' : 'Covers through (opt.)'}</span>
            <input type="date" value={covers} onChange={(e) => setCovers(e.target.value)} className="mt-1 w-full h-11 px-3 bg-black/5 rounded-xl" />
          </label>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full h-11 px-3 bg-black/5 rounded-xl" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button onClick={save} disabled={busy || !amount} className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30">
          {busy ? 'Saving…' : 'Save payment'}
        </button>
      </div>
    </div>
  )
}
