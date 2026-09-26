'use client'

// The families' price list: whatever the owners marked public. Renders
// nothing when there is nothing public, so it can sit on pages before prices
// exist without showing an empty box.

import { useEffect, useState } from 'react'
import { money } from '@/lib/formatMoney'

interface Item {
  id: string
  name: string
  priceCents: number
  unit: string
  durationMinutes: number | null
  sessionsIncluded: number | null
  description: string | null
  classType: string | null
}

export function usePriceList() {
  const [data, setData] = useState<{ items: Item[]; note: string | null } | null>(null)
  useEffect(() => {
    fetch('/api/gym/pricing')
      .then((r) => r.json())
      .then((d) => d.success && setData(d.data))
      .catch(() => {})
  }, [])
  return data
}

function unitLabel(i: Item): string {
  if (i.unit === 'month') return '/ month'
  if (i.unit === 'package') return i.sessionsIncluded ? `for ${i.sessionsIncluded} sessions` : ''
  return i.classType && i.classType !== 'private' ? '/ athlete' : '/ session'
}

export function PriceList({ items, note }: { items: Item[]; note: string | null }) {
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="rounded-2xl border border-black/10 px-4 py-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold text-black">{i.name}</div>
            <div className="text-sm text-black/50">
              {i.durationMinutes ? `${i.durationMinutes} min` : ''}
              {i.durationMinutes && i.description ? ' · ' : ''}
              {i.description}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="dsc-headline text-xl text-black">{money(i.priceCents)}</div>
            <div className="dsc-label text-black/40">{unitLabel(i)}</div>
          </div>
        </div>
      ))}
      {note && <p className="text-sm text-black/50 pt-1">{note}</p>}
    </div>
  )
}
