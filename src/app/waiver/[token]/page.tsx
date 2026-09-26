'use client'

// Public waiver signing page, reached from the link staff send for profiles
// they created. Same full legal text as the check-in kiosk.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { WAIVER_TEXT, WAIVER_TITLE } from '@/lib/waiver'

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string; signed: boolean }
  | { kind: 'ready'; firstName: string; lastName: string }
  | { kind: 'done'; firstName: string }

export default function WaiverSignPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [legalName, setLegalName] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/waiver/link?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setState({ kind: 'ready', ...d.data })
        else setState({ kind: 'unavailable', message: d.error, signed: d.reason === 'signed' })
      })
      .catch(() =>
        setState({ kind: 'unavailable', message: 'Could not reach the server. Try again.', signed: false })
      )
  }, [token])

  async function sign() {
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/waiver/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, legalName, agree }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not sign.')
        return
      }
      setState({ kind: 'done', firstName: d.data.firstName })
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="dsc-headline text-3xl text-black">DSC</div>
          <div className="dsc-label text-black/40 mt-1">Dallas Sport Collective</div>
        </div>

        {state.kind === 'loading' && (
          <div className="dsc-label text-black/40 text-center py-10">Loading…</div>
        )}

        {state.kind === 'unavailable' && (
          <div
            className={`rounded-3xl p-6 text-center ${
              state.signed ? 'bg-emerald-50 text-emerald-950' : 'bg-black/[0.04] text-black/70'
            }`}
          >
            {state.message}
          </div>
        )}

        {state.kind === 'done' && (
          <div className="rounded-3xl bg-emerald-50 p-8 text-center">
            <div className="dsc-headline text-3xl text-emerald-950">Signed. Thank you.</div>
            <p className="text-emerald-900 mt-3">
              {state.firstName}&rsquo;s waiver is on file with DSC. You can close this page.
            </p>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="space-y-6">
            <div>
              <div className="dsc-label text-black/40">Waiver for</div>
              <div className="dsc-headline text-3xl text-black">
                {state.firstName} {state.lastName}
              </div>
              <p className="text-sm text-black/60 mt-2">
                A parent or guardian should sign for anyone under 18.
              </p>
            </div>

            <div className="rounded-3xl bg-black/[0.04] p-5 max-h-[55vh] overflow-y-auto">
              <h1 className="font-black text-center mb-1">{WAIVER_TITLE}</h1>
              <p className="text-center text-black/50 text-sm mb-4">Dallas Sports Collective, LLC</p>
              <div className="whitespace-pre-wrap text-sm text-black/80 leading-relaxed">{WAIVER_TEXT}</div>
            </div>

            <label className="block">
              <span className="dsc-label text-black/50">Full legal name (signer)</span>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full h-12 px-4 bg-black/5 rounded-xl text-black"
                placeholder="Type your full name"
              />
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 w-5 h-5 accent-black"
              />
              <span className="text-sm text-black/70">
                I have read and fully understand the terms of this Agreement and understand that I am
                giving up legal rights by signing this Agreement.
              </span>
            </label>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              onClick={sign}
              disabled={!agree || legalName.trim().length < 2 || submitting}
              className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {submitting ? 'Signing…' : 'Sign waiver'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
