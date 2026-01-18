'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

type CheckinState = 'input' | 'loading' | 'success' | 'no-session' | 'walk-in' | 'error'

interface CheckinData {
  athlete?: {
    firstName: string
    lastName: string
  }
  trainer?: {
    name: string
  }
  session?: {
    scheduledAt: string
    duration: number
  } | null
  nextSession?: {
    scheduledAt: string
  } | null
  walkIn?: {
    id: string
    name: string
    time: string
  }
  message: string
}

export default function CheckinPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<CheckinState>('input')
  const [data, setData] = useState<CheckinData | null>(null)
  const [error, setError] = useState('')

  // Auto-reset after success/error
  useEffect(() => {
    if (state === 'success' || state === 'no-session' || state === 'walk-in') {
      const timer = setTimeout(() => {
        setState('input')
        setEmail('')
        setData(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [state])

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setState('loading')
    setError('')

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || 'Check-in failed')
        setState('error')
        return
      }

      // Handle walk-in response
      if (result.isWalkIn) {
        setData({ walkIn: result.data.walkIn, message: result.message })
        setState('walk-in')
        return
      }

      setData({ ...result.data, message: result.message })
      setState(result.data.matched ? 'success' : 'no-session')
    } catch {
      setError('An error occurred')
      setState('error')
    }
  }

  function handleReset() {
    setState('input')
    setEmail('')
    setData(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header with Logo */}
      <header className="bg-white py-8 px-4 flex flex-col items-center">
        <Image
          src="/dsc-logo.svg"
          alt="Dallas Sports Collective"
          width={120}
          height={120}
        />
      </header>

      {/* Main Content with Background Image */}
      <main className="flex-1 relative">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/checkin-bg.jpg"
            alt="Gym"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Overlay Content */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-end px-4 pb-8">
          {/* Input State */}
          {state === 'input' && (
            <form onSubmit={handleCheckin} className="w-full max-w-sm space-y-3 mb-5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ENTER EMAIL"
                className="w-full px-5 py-3 text-base font-bold tracking-wider text-center bg-white rounded-[25px] focus:outline-none focus:ring-4 focus:ring-white/50 placeholder:text-gray-400 placeholder:font-bold"
                autoFocus
              />
              <button
                type="submit"
                className="w-full px-5 py-3 text-base font-black tracking-wider bg-black text-white rounded-[25px] hover:bg-gray-900 transition-colors"
              >
                SUBMIT
              </button>
            </form>
          )}

          {/* Loading State */}
          {state === 'loading' && (
            <div className="text-center bg-black/70 backdrop-blur rounded-2xl p-8">
              <div className="text-white text-xl mb-4">Finding your session...</div>
              <div className="animate-pulse text-white text-4xl">...</div>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && data && data.athlete && data.trainer && (
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-green-400">&#10003;</div>
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.athlete.firstName}!
              </h2>
              <div className="bg-white/10 rounded-lg p-4 space-y-2">
                <p className="text-xl text-white">Trainer: {data.trainer.name}</p>
                {data.session && (
                  <p className="text-lg text-gray-300">
                    Session at{' '}
                    {new Date(data.session.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          )}

          {/* No Session State */}
          {state === 'no-session' && data && data.athlete && (
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.athlete.firstName}!
              </h2>
              <div className="bg-yellow-500/20 rounded-lg p-4">
                <p className="text-xl text-white">No session scheduled for today</p>
                {data.nextSession && (
                  <p className="text-gray-300 mt-2">
                    Next session:{' '}
                    {new Date(data.nextSession.scheduledAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          )}

          {/* Walk-in State */}
          {state === 'walk-in' && data && (
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl">&#128075;</div>
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.walkIn?.name}!
              </h2>
              <div className="bg-blue-500/20 rounded-lg p-4">
                <p className="text-xl text-white">You&apos;ve been checked in as a walk-in</p>
                <p className="text-gray-300 mt-2">
                  Please speak with a trainer to get set up with an account
                </p>
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-red-500">!</div>
              <p className="text-xl text-red-400">{error}</p>
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-100"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Bottom Tagline */}
        <div className="absolute bottom-0 left-0 right-0 py-5 z-10">
          <p className="text-white text-center text-xl font-semibold tracking-[0.3em] uppercase">
            Unlock Your Peak Performance
          </p>
        </div>
      </main>
    </div>
  )
}
