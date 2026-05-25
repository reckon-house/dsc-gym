'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

// Only redirect to an internal app path. Prevents `?returnTo=https://evil`.
function safeReturnTo(raw: string | null): string {
  if (!raw) return '/athlete/dashboard'
  // Must start with '/' and NOT '//' (which would be protocol-relative).
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/athlete/dashboard'
  return raw
}

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; needsVerification?: boolean } | null>(null)

  // Detect what the user is typing so we can pick the right keyboard
  // (numeric pad for phone) and autoComplete hint. Switches as they type.
  const looksLikePhone =
    identifier.length > 0 &&
    !identifier.includes('@') &&
    /^[\d\s\-\(\)\+]+$/.test(identifier)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/athletes/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await res.json()
      if (data.success) {
        router.replace(returnTo)
      } else {
        setError({
          message: data.error || 'Login failed',
          needsVerification: data.needsVerification,
        })
      }
    } catch {
      setError({ message: 'Network error — try again' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 md:px-6 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
        <Link
          href="/athlete/register"
          className="dsc-label text-black/60 hover:text-black"
        >
          Register
        </Link>
      </header>

      <div className="flex-1 flex items-stretch px-4 pb-4 md:px-0 md:pb-0">
        <div
          className="relative w-full rounded-3xl md:rounded-none overflow-hidden flex flex-col justify-end dsc-image-enter"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '70vh',
          }}
        >
          {/* Stronger gradient at the bottom so form fields are legible */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          <div className="relative p-6 pb-8 md:p-10 md:pb-10 w-full max-w-md mx-auto space-y-6">
            <div className="dsc-enter">
              <div className="dsc-label text-white/70 mb-2">Athlete</div>
              <h2 className="dsc-headline text-4xl md:text-6xl text-white leading-[0.85]">
                Welcome
                <br />
                back.
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2 dsc-enter-delay-1">
              <input
                type={looksLikePhone ? 'tel' : 'text'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete={looksLikePhone ? 'tel' : 'username'}
                inputMode={looksLikePhone ? 'tel' : 'email'}
                placeholder="Email or mobile"
                className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Password"
                className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
              />

              {error && (
                <div className="bg-white rounded-2xl px-5 py-3 flex items-start gap-3">
                  <span
                    className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0"
                    aria-hidden
                  />
                  <div className="text-sm leading-snug text-black">
                    {error.needsVerification ? (
                      <>
                        <div className="font-semibold">Confirm your email first.</div>
                        <div className="text-black/60 mt-0.5">
                          Tap the link we sent to your inbox.
                        </div>
                      </>
                    ) : (
                      <div>{error.message}</div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 border-2 border-white/80 text-white rounded-full dsc-headline text-lg hover:bg-white/10 transition-colors disabled:opacity-40 mt-3"
              >
                {loading ? 'SIGNING IN…' : 'SIGN IN'}
              </button>

              <p className="text-center text-sm text-white/70 pt-2">
                New to DSC?{' '}
                <Link href="/athlete/register" className="underline text-white">
                  Register
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AthleteLogin() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
