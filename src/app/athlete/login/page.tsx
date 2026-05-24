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
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '70vh',
          }}
        >
          {/* Gradient to bottom for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

          <div className="relative h-full flex flex-col justify-end p-4 md:p-6">
            <div className="mb-4">
              <div className="dsc-label text-white/70 mb-2">Athlete</div>
              <h2 className="dsc-headline text-4xl md:text-5xl text-white leading-[0.85]">
                Welcome
                <br />
                back.
              </h2>
            </div>

            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl p-5 space-y-3 shadow-2xl"
            >
              <label className="block">
                <div className="dsc-label text-black/50 mb-1">Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-11 px-4 bg-black/5 rounded-xl text-[15px] text-black placeholder:text-black/40 focus:outline-none focus:bg-black/[0.07]"
                />
              </label>
              <label className="block">
                <div className="dsc-label text-black/50 mb-1">Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-11 px-4 bg-black/5 rounded-xl text-[15px] text-black placeholder:text-black/40 focus:outline-none focus:bg-black/[0.07]"
                />
              </label>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                  {error.message}
                  {error.needsVerification && (
                    <div className="mt-1 text-xs">
                      Check your inbox for the confirmation link.
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="text-center text-sm text-black/50 pt-1">
                New to DSC?{' '}
                <Link href="/athlete/register" className="underline text-black">
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
