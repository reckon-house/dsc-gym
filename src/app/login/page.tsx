'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Login failed')
        return
      }

      if (data.user.role === 'ADMIN') {
        router.push('/admin')
      } else {
        router.push('/trainer')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <Link href="/login" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
        </Link>
        <Link
          href="/athlete"
          className="dsc-label text-black/60 hover:text-black"
        >
          Athlete sign in
        </Link>
      </header>

      <div className="flex-1 flex items-stretch px-4 pb-4">
        <div
          className="relative w-full rounded-3xl overflow-hidden flex flex-col justify-end dsc-image-enter"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '70vh',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          <div className="relative p-6 pb-8 space-y-6">
            <div className="dsc-enter">
              <div className="dsc-label text-white/70 mb-2">Staff</div>
              <h2 className="dsc-headline text-4xl md:text-6xl text-white leading-[0.85]">
                Sign in.
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2 dsc-enter-delay-1">
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
                <div className="bg-white rounded-2xl px-5 py-3 flex items-start gap-3">
                  <span
                    className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0"
                    aria-hidden
                  />
                  <div className="text-sm text-black leading-snug">{error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 border-2 border-white/80 text-white rounded-full dsc-headline text-lg hover:bg-white/10 transition-colors disabled:opacity-40 mt-3"
              >
                {loading ? 'SIGNING IN…' : 'SIGN IN'}
              </button>

              {isDev && (
                <div className="pt-4 border-t border-white/15 mt-4">
                  <div className="dsc-label text-white/40 mb-2">
                    Test accounts (dev only)
                  </div>
                  <div className="font-mono text-xs text-white/60 space-y-1">
                    <div>admin@dsc.com · admin123</div>
                    <div>mike@dsc.com · trainer123</div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
