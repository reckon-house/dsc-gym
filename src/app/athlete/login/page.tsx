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

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="dsc-label text-black/40 mb-2">Athlete</div>
          <h2 className="dsc-headline text-3xl md:text-4xl text-black mb-6">
            Sign in
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <div className="dsc-label text-black/50 mb-1">Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
          </form>

          <p className="text-center mt-6 text-sm text-black/50">
            New to DSC?{' '}
            <Link href="/athlete/register" className="underline text-black">
              Register
            </Link>
          </p>
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
