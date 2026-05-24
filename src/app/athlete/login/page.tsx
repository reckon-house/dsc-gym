'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

function LoginInner() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; needsVerification?: boolean } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/athletes/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.success) {
        router.replace('/athlete/dashboard')
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
      <header className="px-4 py-5 flex items-center justify-between">
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

      <div className="flex-1 flex items-stretch px-4 pb-4">
        <div
          className="relative w-full rounded-3xl overflow-hidden flex flex-col justify-end"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '70vh',
          }}
        >
          {/* Stronger gradient at the bottom so form fields are legible */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          <div className="relative p-6 pb-8 space-y-6">
            <div>
              <div className="dsc-label text-white/70 mb-2">Athlete</div>
              <h2 className="dsc-headline text-4xl md:text-6xl text-white leading-[0.85]">
                Welcome
                <br />
                back.
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="Email"
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
                <div className="rounded-2xl bg-red-500/20 border border-red-300/40 text-red-100 px-4 py-2 text-sm backdrop-blur">
                  {error.message}
                  {error.needsVerification && (
                    <div className="mt-1 text-xs opacity-80">
                      Check your inbox for the confirmation link.
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-black text-white rounded-full dsc-headline text-lg disabled:bg-black/40 mt-3"
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
