'use client'

import { useState, useEffect } from 'react'

type CheckinState = 'input' | 'loading' | 'success' | 'no-session' | 'error'

interface CheckinData {
  athlete: {
    firstName: string
    lastName: string
  }
  trainer: {
    name: string
  }
  session: {
    scheduledAt: string
    duration: number
  } | null
  nextSession: {
    scheduledAt: string
  } | null
  message: string
}

export default function CheckinPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<CheckinState>('input')
  const [data, setData] = useState<CheckinData | null>(null)
  const [error, setError] = useState('')

  // Auto-reset after success/error
  useEffect(() => {
    if (state === 'success' || state === 'no-session') {
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

      setData(result.data)
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
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <h1 className="text-white text-4xl font-bold text-center mb-12">
          DSC Check-In
        </h1>

        {/* Input State */}
        {state === 'input' && (
          <form onSubmit={handleCheckin} className="space-y-6">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full p-6 text-2xl rounded-lg text-center focus:outline-none focus:ring-4 focus:ring-white"
              autoFocus
            />
            <button
              type="submit"
              className="w-full p-6 text-2xl font-bold bg-white text-black rounded-lg hover:bg-gray-100"
            >
              Check In
            </button>
          </form>
        )}

        {/* Loading State */}
        {state === 'loading' && (
          <div className="text-center text-white">
            <div className="text-2xl mb-4">Finding your session...</div>
            <div className="animate-pulse text-6xl">...</div>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && data && (
          <div className="text-center text-white space-y-6">
            <div className="text-6xl mb-4">&#10003;</div>
            <h2 className="text-3xl font-bold">
              Welcome, {data.athlete.firstName}!
            </h2>
            <div className="bg-white/10 rounded-lg p-6 space-y-2">
              <p className="text-xl">Trainer: {data.trainer.name}</p>
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
            <p className="text-gray-400">Resetting in 5 seconds...</p>
            <button
              onClick={handleReset}
              className="text-white underline text-sm"
            >
              Check in another person
            </button>
          </div>
        )}

        {/* No Session State */}
        {state === 'no-session' && data && (
          <div className="text-center text-white space-y-6">
            <h2 className="text-3xl font-bold">
              Welcome, {data.athlete.firstName}!
            </h2>
            <div className="bg-yellow-500/20 rounded-lg p-6">
              <p className="text-xl">No session scheduled for today</p>
              {data.nextSession && (
                <p className="text-gray-300 mt-2">
                  Next session:{' '}
                  {new Date(data.nextSession.scheduledAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={handleReset}
              className="text-white underline text-sm"
            >
              Check in another person
            </button>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="text-center text-white space-y-6">
            <div className="text-6xl mb-4 text-red-500">!</div>
            <p className="text-xl text-red-400">{error}</p>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-white text-black rounded-lg font-bold"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
