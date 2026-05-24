'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function VerifyInner() {
  const params = useSearchParams()
  const token = params.get('token')

  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [stage, setStage] = useState<'sign' | 'ok' | 'error'>('sign')
  const [message, setMessage] = useState('')

  async function handleConfirm() {
    if (!token) {
      setStage('error')
      setMessage('No verification token in the link.')
      return
    }
    if (!agreed) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/athletes/verify?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (data.success) {
        setStage('ok')
        setMessage(
          data.alreadyVerified
            ? 'Your email was already confirmed.'
            : 'Your email is confirmed and your waiver is on file.'
        )
      } else {
        setStage('error')
        setMessage(data.error || 'Could not verify.')
      }
    } catch {
      setStage('error')
      setMessage('Network error — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image
            src="/logo-mark.png"
            alt="DSC"
            width={40}
            height={40}
            priority
          />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          {stage === 'sign' && (
            <SignWaiver
              agreed={agreed}
              setAgreed={setAgreed}
              submitting={submitting}
              onConfirm={handleConfirm}
              missingToken={!token}
            />
          )}

          {stage === 'ok' && (
            <div className="text-center">
              <div className="dsc-label text-emerald-700 mb-2">Confirmed</div>
              <h2 className="dsc-headline text-4xl text-black mb-4">
                You&rsquo;re in
              </h2>
              <p className="text-black/70 mb-6">{message}</p>
              <Link
                href="/athlete/login"
                className="inline-block px-6 py-3 bg-black text-white rounded-full font-semibold"
              >
                Sign in
              </Link>
            </div>
          )}

          {stage === 'error' && (
            <div className="text-center">
              <div className="dsc-label text-red-700 mb-2">Trouble</div>
              <h2 className="dsc-headline text-3xl text-black mb-4">
                We couldn&rsquo;t confirm
              </h2>
              <p className="text-black/70 mb-6">{message}</p>
              <Link
                href="/athlete/register"
                className="inline-block px-6 py-3 bg-black text-white rounded-full font-semibold"
              >
                Start over
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SignWaiver({
  agreed,
  setAgreed,
  submitting,
  onConfirm,
  missingToken,
}: {
  agreed: boolean
  setAgreed: (v: boolean) => void
  submitting: boolean
  onConfirm: () => void
  missingToken: boolean
}) {
  return (
    <div>
      <div className="dsc-label text-black/40 mb-2">One last thing</div>
      <h2 className="dsc-headline text-3xl md:text-4xl text-black mb-4">
        Sign the waiver
      </h2>
      <p className="text-black/70 mb-6 leading-snug">
        Please read and acknowledge the participant waiver before we activate
        your account. This is a one-time, required step.
      </p>

      <div className="rounded-2xl bg-black/[0.04] p-5 mb-5 max-h-[40vh] overflow-y-auto text-sm text-black/80 leading-relaxed space-y-3">
        <p>
          <span className="dsc-label text-black/50 block mb-1">
            Assumption of risk
          </span>
          Physical training involves inherent risks including injury,
          disability, or death. By participating in training at Dallas Sports
          Collective, I voluntarily assume all such risks.
        </p>
        <p>
          <span className="dsc-label text-black/50 block mb-1">
            Health declaration
          </span>
          I confirm I am in good physical condition and have no medical
          conditions that would prevent participation. I will inform my trainer
          of any limitations.
        </p>
        <p>
          <span className="dsc-label text-black/50 block mb-1">
            Release of liability
          </span>
          I release Dallas Sports Collective, its owners, trainers, employees,
          and agents from any liability for injury or damage arising from
          training activities.
        </p>
        <p>
          <span className="dsc-label text-black/50 block mb-1">
            Emergency treatment
          </span>
          In the event of an emergency, I authorize DSC staff to seek medical
          treatment on my behalf.
        </p>
        <p>
          <span className="dsc-label text-black/50 block mb-1">
            Personal property
          </span>
          DSC is not responsible for personal property lost, stolen, or damaged
          on the premises.
        </p>
      </div>

      <label className="flex items-start gap-3 mb-5 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-5 h-5 accent-black shrink-0"
        />
        <span className="text-sm text-black/80 leading-snug">
          I have read this waiver, I&rsquo;m at least 18 (or my legal guardian
          has agreed for me), and I sign it voluntarily.
        </span>
      </label>

      <button
        onClick={onConfirm}
        disabled={!agreed || submitting || missingToken}
        className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/20 disabled:cursor-not-allowed transition-colors"
      >
        {submitting
          ? 'Confirming…'
          : missingToken
            ? 'Invalid link'
            : 'Confirm & activate'}
      </button>

      <p className="text-center text-xs text-black/40 mt-3">
        Already confirmed? <Link href="/athlete/login" className="underline">Sign in instead</Link>
      </p>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  )
}
