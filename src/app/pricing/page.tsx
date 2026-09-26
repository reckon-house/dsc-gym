'use client'

// Public price page — link it from the website. Shows only what the owners
// marked public, and says so plainly when that's nothing yet.

import Image from 'next/image'
import Link from 'next/link'
import { PriceList, usePriceList } from '@/components/PriceList'

export default function PricingPage() {
  const data = usePriceList()
  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} />
          <div>
            <div className="dsc-headline text-2xl text-black">Pricing</div>
            <div className="dsc-label text-black/40">Dallas Sport Collective</div>
          </div>
        </div>
        {!data ? (
          <div className="dsc-label text-black/40 py-8 text-center">Loading…</div>
        ) : data.items.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center text-black/60">
            Prices aren&rsquo;t posted yet — reach out to the gym and we&rsquo;ll walk you through the options.
          </div>
        ) : (
          <PriceList items={data.items} note={data.note} />
        )}
        <div className="mt-10 text-center">
          <Link href="/athlete" className="h-12 px-6 inline-flex items-center rounded-full bg-black text-white font-semibold">
            Sign up or log in
          </Link>
        </div>
      </div>
    </main>
  )
}
