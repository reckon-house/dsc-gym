'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <span className="dsc-headline text-2xl text-black">DSC</span>
        <Link
          href="/athlete"
          className="dsc-label text-black/60 hover:text-black"
        >
          Athlete sign in
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="dsc-label text-black/40 mb-2">Staff</div>
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
                placeholder="you@dsc.com"
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
                {error}
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

          <div className="mt-8 pt-6 border-t border-black/10">
            <div className="dsc-label text-black/40 mb-2">Test accounts</div>
            <div className="font-mono text-xs text-black/60 space-y-1">
              <div>admin@dsc.com · admin123</div>
              <div>mike@dsc.com · trainer123</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
