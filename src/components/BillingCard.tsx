'use client'

// Owner-only billing panel on an athlete's profile: plan, balance, payments.

import { useCallback, useEffect, useState } from 'react'
import { money } from '@/lib/formatMoney'
import { PaymentSheet } from '@/components/PaymentSheet'

interface Billing {
  startedOn: string | null
  plan: 'per_session' | 'monthly' | 'comp'
  paidThrough: string | null
  billingNote: string | null
  balance: {
    owedCents: number
    chargesCents: number
    paidCents: number
    visits: number
    estimatedVisits: number
    unpricedVisits: number
    behind: boolean
    daysBehind: number | null
  } | null
  payments: { id: string; amountCents: number; paidOn: string; method: string | null; note: string | null; coversThrough: string | null; voided: boolean }[]
}

const PLANS: { v: Billing['plan']; l: string }[] = [
  { v: 'per_session', l: 'Per session' },
  { v: 'monthly', l: 'Monthly' },
  { v: 'comp', l: 'Comp' },
]

export function BillingCard({ athleteId, name }: { athleteId: string; name: string }) {
  const [b, setB] = useState<Billing | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/owner/athletes/${athleteId}`)
      .then((r) => r.json())
      .then((d) => d.success && setB(d.data))
      .catch(() => {})
  }, [athleteId])
  useEffect(() => {
    load()
  }, [load])

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/owner/athletes/${athleteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => ({ success: false }))
    setError(d.success ? null : d.error ?? 'Could not save.')
    load()
  }

  async function voidPayment(id: string) {
    if (!confirm('Void this payment? It stays in the history, marked void.')) return
    await fetch(`/api/owner/payments/${id}`, { method: 'DELETE' })
    load()
  }

  if (!b) return null
  const bal = b.balance

  return (
    <div className="rounded-3xl bg-black/[0.04] p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="dsc-label text-black/40">Billing · owners only</div>
        <button onClick={() => setPaying(true)} className="dsc-label px-3 py-1.5 rounded-full bg-black text-white">
          Record payment
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PLANS.map((p) => (
          <button
            key={p.v}
            onClick={() => b.plan !== p.v && patch({ billingPlan: p.v })}
            className={`h-9 px-3 rounded-full text-sm ${b.plan === p.v ? 'bg-black text-white' : 'bg-white text-black/70'}`}
          >
            {p.l}
          </button>
        ))}
      </div>

      {b.plan === 'per_session' &&
        (b.startedOn && bal ? (
          <div className="text-sm text-black">
            <span className={`dsc-headline text-2xl ${bal.owedCents > 0 ? 'text-red-700' : 'text-black'}`}>
              {bal.owedCents > 0 ? `${money(bal.owedCents)} owed` : bal.owedCents < 0 ? `${money(-bal.owedCents)} credit` : 'Paid up'}
            </span>
            <div className="text-xs text-black/50 mt-1">
              Since {b.startedOn}: {bal.visits} visits = {money(bal.chargesCents)}, paid {money(bal.paidCents)}
              {bal.estimatedVisits ? ` · ${bal.estimatedVisits} visits had no attendance taken and are assumed` : ''}
              {bal.unpricedVisits ? ` · ${bal.unpricedVisits} have no price yet` : ''}
            </div>
          </div>
        ) : (
          <p className="text-sm text-black/50">Balances haven&rsquo;t been started — set a start date on the Money page.</p>
        ))}

      {b.plan === 'monthly' && (
        <div className="text-sm">
          <div className={bal?.behind ? 'text-red-700 font-semibold' : 'text-black'}>
            {b.paidThrough ? `Paid through ${b.paidThrough}` : 'No payment recorded'}
            {bal?.daysBehind ? ` · ${bal.daysBehind} days behind` : ''}
          </div>
          <label className="flex items-center gap-2 mt-2 text-xs text-black/60">
            Set paid-through
            <input
              type="date"
              defaultValue={b.paidThrough ?? ''}
              onBlur={(e) => e.target.value !== (b.paidThrough ?? '') && patch({ paidThrough: e.target.value || null })}
              className="h-8 px-2 bg-white rounded-lg"
            />
          </label>
        </div>
      )}

      {b.plan === 'comp' && <p className="text-sm text-black/60">Not billed. Visits aren&rsquo;t counted as revenue.</p>}

      <input
        defaultValue={b.billingNote ?? ''}
        onBlur={(e) => e.target.value !== (b.billingNote ?? '') && patch({ billingNote: e.target.value })}
        placeholder="Billing note (e.g. pays for both kids, 10-pack)"
        className="w-full h-10 px-3 mt-3 bg-white rounded-xl text-sm"
      />
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}

      {b.payments.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="dsc-label text-black/40 mb-1">Payments</div>
          {b.payments.map((p) => (
            <div key={p.id} className={`flex items-center justify-between text-sm ${p.voided ? 'opacity-40 line-through' : ''}`}>
              <span className="text-black">
                {money(p.amountCents)}
                <span className="text-black/50">
                  {' '}
                  · {p.paidOn}
                  {p.method ? ` · ${p.method}` : ''}
                  {p.coversThrough ? ` · through ${p.coversThrough}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
              </span>
              {!p.voided && (
                <button onClick={() => voidPayment(p.id)} className="dsc-label text-black/30 hover:text-red-700 shrink-0">
                  Void
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {paying && (
        <PaymentSheet
          athleteId={athleteId}
          name={name}
          plan={b.plan}
          suggestCents={b.plan === 'per_session' && bal && bal.owedCents > 0 ? bal.owedCents : null}
          paidThrough={b.paidThrough}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false)
            load()
          }}
        />
      )}
    </div>
  )
}
