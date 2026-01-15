'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Session {
  id: string
  scheduledAt: string
  duration: number
  completed: boolean
  athlete: {
    id: string
    firstName: string
    lastName: string
  }
}

interface Athlete {
  id: string
  firstName: string
  lastName: string
  email: string
}

export default function TrainerDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parseResult, setParseResult] = useState<Record<string, unknown> | null>(null)
  const [user, setUser] = useState<{ name: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchUser()
    fetchTodaySessions()
    fetchAthletes()
  }, [])

  async function fetchUser() {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    if (data.success) {
      setUser(data.user)
    }
  }

  async function fetchTodaySessions() {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/sessions?date=${today}`)
    const data = await res.json()
    if (data.success) {
      setSessions(data.data)
    }
  }

  async function fetchAthletes() {
    const res = await fetch('/api/athletes')
    const data = await res.json()
    if (data.success) {
      setAthletes(data.data)
    }
  }

  async function handleParse(execute = false) {
    if (!input.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, execute }),
      })
      const data = await res.json()
      setParseResult(data)

      if (execute && data.success) {
        setInput('')
        fetchTodaySessions()
        fetchAthletes()
      }
    } catch (error) {
      console.error('Parse error:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleComplete(sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
    })
    if ((await res.json()).success) {
      fetchTodaySessions()
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-black text-white p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">DSC Trainer Dashboard</h1>
          <div className="flex items-center gap-4">
            <span>{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm bg-white text-black px-3 py-1 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {/* Natural Language Input */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Schedule Sessions</h2>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                e.preventDefault()
                handleParse(true)
              }
            }}
            placeholder='Type naturally, e.g., "John tomorrow at 3pm" (Press Enter to create, Shift+Enter for new line)'
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black focus:border-black"
            rows={3}
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => handleParse(false)}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Preview
            </button>
            <button
              onClick={() => handleParse(true)}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Create'}
            </button>
          </div>

          {/* Parse Result */}
          {parseResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(parseResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Today's Sessions */}
          <div className="md:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Today&apos;s Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-gray-500">No sessions scheduled for today</p>
            ) : (
              <ul className="space-y-3">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className={`flex justify-between items-center p-3 rounded ${
                      session.completed ? 'bg-green-50' : 'bg-gray-50'
                    }`}
                  >
                    <div>
                      <span className="font-medium">
                        {session.athlete.firstName} {session.athlete.lastName}
                      </span>
                      <span className="text-gray-500 ml-2">
                        {new Date(session.scheduledAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {session.completed ? (
                      <span className="text-green-600 font-medium">Completed</span>
                    ) : (
                      <button
                        onClick={() => handleComplete(session.id)}
                        className="px-3 py-1 bg-black text-white text-sm rounded"
                      >
                        Complete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Athletes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">My Athletes</h2>
            {athletes.length === 0 ? (
              <p className="text-gray-500">No athletes yet</p>
            ) : (
              <ul className="space-y-2">
                {athletes.map((athlete) => (
                  <li key={athlete.id} className="text-sm">
                    {athlete.firstName} {athlete.lastName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
