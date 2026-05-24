'use client'

import { Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function VerifyInner() {
  const params = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('No verification token in the link.')
      return
    }
    void (async () => {
      try {
        const res = await fetch(`/api/athletes/verify?token=${encodeURIComponent(token)}`)
        const data = await res.json()
        if (data.success) {
          setState('ok')
          setMessage(
            data.alreadyVerified
              ? 'Your email was already confirmed.'
              : 'Your email is confirmed.'
          )
        } else {
          setState('error')
          setMessage(data.error || 'Could not verify.')
        }
      } catch {
        setState('error')
        setMessage('Network error — try again')
      }
    })()
  }, [token])

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {state === 'loading' && (
            <>
              <div className="dsc-label text-black/40 mb-2">One moment</div>
              <h2 className="dsc-headline text-3xl text-black">Verifying…</h2>
            </>
          )}
          {state === 'ok' && (
            <>
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
            </>
          )}
          {state === 'error' && (
            <>
              <div className="dsc-label text-red-700 mb-2">Trouble</div>
              <h2 className="dsc-headline text-3xl text-black mb-4">
                Verification failed
              </h2>
              <p className="text-black/70 mb-6">{message}</p>
              <Link
                href="/athlete/register"
                className="inline-block px-6 py-3 bg-black text-white rounded-full font-semibold"
              >
                Start over
              </Link>
            </>
          )}
        </div>
      </div>
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
