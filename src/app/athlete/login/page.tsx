'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function AthleteLoginContent() {
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [justRegistered, setJustRegistered] = useState(false)

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setJustRegistered(true)
    }
  }, [searchParams])

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Please enter your name' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = await res.json()

      if (data.success) {
        setMessage({
          type: 'success',
          text: data.matched
            ? `Welcome, ${data.athleteName}! You're checked in for your session.`
            : `Welcome, ${data.athleteName}! Check-in recorded.`,
        })
        setName('')
      } else {
        setMessage({ type: 'error', text: data.error || 'Check-in failed' })
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="pt-8 pb-4 text-center">
        <Link href="/athlete">
          <h1 className="text-3xl font-bold tracking-widest">DSC</h1>
        </Link>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          {justRegistered && (
            <div className="mb-6 p-4 bg-green-900/50 border border-green-600 text-green-200 text-center">
              Registration successful! You can now check in for your sessions.
            </div>
          )}

          <h2 className="text-2xl font-bold text-center mb-2 tracking-wide">
            ATHLETE CHECK-IN
          </h2>
          <p className="text-white/60 text-center mb-8">
            Enter your name to start your training session
          </p>

          <form onSubmit={handleCheckIn} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 tracking-wide">
                YOUR NAME
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    e.preventDefault()
                    handleCheckIn(e)
                  }
                }}
                placeholder="First and last name"
                className="w-full px-4 py-4 bg-white/10 border border-white/30 text-white text-lg placeholder-white/50 focus:border-white focus:outline-none"
                autoFocus
              />
            </div>

            {message && (
              <div
                className={`p-4 text-center ${
                  message.type === 'success'
                    ? 'bg-green-900/50 border border-green-600 text-green-200'
                    : 'bg-red-900/50 border border-red-600 text-red-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-4 bg-white text-black font-bold text-xl tracking-wide hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {loading ? 'CHECKING IN...' : 'START TRAINING'}
            </button>
          </form>

          <p className="text-center mt-8 text-white/60 text-sm">
            New athlete?{' '}
            <Link href="/athlete/register" className="underline hover:text-white">
              Register here
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center">
        <p className="text-white/40 text-sm">
          DSPORT COLLECTIVE
        </p>
      </div>
    </div>
  )
}

export default function AthleteLogin() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading...</p>
      </div>
    }>
      <AthleteLoginContent />
    </Suspense>
  )
}
