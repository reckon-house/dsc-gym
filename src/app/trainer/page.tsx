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

interface QueryResultData {
  sessions?: Array<{
    id: string
    athleteName: string
    scheduledAt: string
    duration: number
    completed: boolean
    cancelled: boolean
  }>
  athletes?: Array<{
    id: string
    firstName: string
    lastName: string
    email: string
  }>
  checkIns?: Array<{
    id: string
    athleteName: string
    checkInTime: string
    matchedSession: boolean
  }>
  attendanceReport?: {
    totalSessionsInPeriod: number
    checkedInCount: number
    missedCount: number
    athletesWithMissedSessions: Array<{
      athleteId: string
      athleteName: string
      missedCount: number
      totalSessions: number
    }>
  }
  count?: number
  summary?: {
    totalSessions: number
    completedSessions: number
    upcomingSessions: number
    totalAthletes: number
  }
}

interface QueryResultCard {
  id: string
  type: 'sessions' | 'athletes' | 'count' | 'summary' | 'checkIns' | 'attendanceReport'
  data: QueryResultData
  message: string
  expanded: boolean
  timestamp: Date
}

interface ParseResponse {
  success: boolean
  action?: string
  message?: string
  humanReadableSummary?: string
  data?: {
    queryResult?: QueryResultData
    athlete?: { id: string; firstName: string; lastName: string }
    session?: { id: string }
  }
}

export default function TrainerDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [queryResults, setQueryResults] = useState<QueryResultCard[]>([])
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

  function determineQueryType(queryResult: QueryResultData): QueryResultCard['type'] {
    if (queryResult.sessions) return 'sessions'
    if (queryResult.athletes) return 'athletes'
    if (queryResult.checkIns) return 'checkIns'
    if (queryResult.attendanceReport) return 'attendanceReport'
    if (queryResult.summary) return 'summary'
    return 'count'
  }

  async function handleParse(execute = false) {
    if (!input.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, execute }),
      })
      const data: ParseResponse = await res.json()

      // Handle query results - add to accordion cards
      if (data.success && data.action === 'QUERY' && data.data?.queryResult) {
        const queryResult = data.data.queryResult
        const newCard: QueryResultCard = {
          id: `query-${Date.now()}`,
          type: determineQueryType(queryResult),
          data: queryResult,
          message: data.humanReadableSummary || data.message || 'Query results',
          expanded: true,
          timestamp: new Date(),
        }
        setQueryResults(prev => [newCard, ...prev])
        setInput('')
      }
      // Handle mutations (create session, create athlete, etc)
      else if (data.success && execute) {
        setResult({
          success: true,
          message: data.humanReadableSummary || data.message || 'Done!'
        })
        setInput('')
        fetchTodaySessions()
        fetchAthletes()
      }
      // Handle preview or error
      else if (!execute) {
        setResult({
          success: data.success,
          message: data.humanReadableSummary || data.message || 'Preview: ' + JSON.stringify(data)
        })
      }
      else {
        setResult({
          success: false,
          message: data.humanReadableSummary || data.message || 'Something went wrong'
        })
      }
    } catch (error) {
      console.error('Parse error:', error)
      setResult({ success: false, message: 'An error occurred' })
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

  function toggleQueryResult(id: string) {
    setQueryResults(prev =>
      prev.map(qr =>
        qr.id === id ? { ...qr, expanded: !qr.expanded } : qr
      )
    )
  }

  function removeQueryResult(id: string) {
    setQueryResults(prev => prev.filter(qr => qr.id !== id))
  }

  function clearAllQueryResults() {
    setQueryResults([])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-black text-white p-3 md:p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-lg md:text-xl font-bold">DSC Trainer</h1>
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-xs md:text-sm hidden sm:inline">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-xs md:text-sm bg-white text-black px-2 md:px-3 py-1 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-3 md:p-6">
        {/* Natural Language Input */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-4 md:mb-6">
          <h2 className="text-base md:text-lg font-semibold mb-2">Ask or Schedule</h2>
          <p className="text-xs md:text-sm text-gray-700 mb-3">
            Try: &quot;Marcus tomorrow at 3pm&quot; &bull; &quot;Show my schedule this week&quot;
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                e.preventDefault()
                handleParse(true)
              }
            }}
            placeholder="Type your request..."
            className="w-full p-2 md:p-3 border rounded-lg text-black placeholder:text-gray-700 focus:ring-2 focus:ring-black focus:border-black text-sm md:text-base"
            rows={2}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-3">
            <button
              onClick={() => handleParse(false)}
              disabled={loading || !input.trim()}
              className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm md:text-base"
            >
              Preview
            </button>
            <button
              onClick={() => handleParse(true)}
              disabled={loading || !input.trim()}
              className="px-3 md:px-4 py-1.5 md:py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm md:text-base"
            >
              {loading ? '...' : 'Go'}
            </button>
            {queryResults.length > 0 && (
              <button
                onClick={clearAllQueryResults}
                className="px-3 md:px-4 py-1.5 md:py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 text-sm md:text-base"
              >
                Clear
              </button>
            )}
          </div>

          {/* Result message */}
          {result && (
            <div className={`mt-3 md:mt-4 p-2 md:p-3 rounded text-sm md:text-base ${
              result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.message}
            </div>
          )}
        </div>

        {/* Query Results - Accordion Cards */}
        {queryResults.length > 0 && (
          <div className="space-y-3 md:space-y-4 mb-4 md:mb-6">
            {queryResults.map((qr) => (
              <div key={qr.id} className="bg-white rounded-lg shadow">
                {/* Card Header */}
                <div className="flex items-center justify-between p-3 md:p-4 border-b">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <button
                      onClick={() => toggleQueryResult(qr.id)}
                      className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-base md:text-lg"
                      title={qr.expanded ? 'Collapse' : 'Expand'}
                    >
                      {qr.expanded ? '−' : '+'}
                    </button>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm md:text-base truncate">{qr.message}</h3>
                      <span className="text-xs md:text-sm text-gray-700">
                        {qr.type === 'sessions' && qr.data.sessions && `${qr.data.sessions.length} session(s)`}
                        {qr.type === 'athletes' && qr.data.athletes && `${qr.data.athletes.length} athlete(s)`}
                        {qr.type === 'checkIns' && qr.data.checkIns && `${qr.data.checkIns.length} check-in(s)`}
                        {qr.type === 'attendanceReport' && qr.data.attendanceReport && `${qr.data.attendanceReport.athletesWithMissedSessions.length} missed`}
                        {qr.type === 'count' && qr.data.count !== undefined && `Count: ${qr.data.count}`}
                        {qr.type === 'summary' && 'Summary'}
                        {' • '}
                        {qr.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeQueryResult(qr.id)}
                    className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center rounded hover:bg-red-100 text-gray-600 hover:text-red-600 text-lg md:text-xl"
                    title="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Card Content - Collapsible */}
                {qr.expanded && (
                  <div className="p-3 md:p-4">
                    {/* Sessions List */}
                    {qr.type === 'sessions' && qr.data.sessions && (
                      <div className="overflow-x-auto">
                        {qr.data.sessions.length === 0 ? (
                          <p className="text-gray-700 text-center py-4 text-sm md:text-base">No sessions found</p>
                        ) : (
                          <table className="w-full text-left text-xs md:text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Date</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Time</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Athlete</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700 hidden sm:table-cell">Duration</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {qr.data.sessions.map((s) => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                  <td className="px-2 md:px-4 py-2 md:py-3">
                                    {new Date(s.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </td>
                                  <td className="px-2 md:px-4 py-2 md:py-3">
                                    {new Date(s.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </td>
                                  <td className="px-2 md:px-4 py-2 md:py-3 font-medium">{s.athleteName}</td>
                                  <td className="px-2 md:px-4 py-2 md:py-3 text-gray-700 hidden sm:table-cell">{s.duration} min</td>
                                  <td className="px-2 md:px-4 py-2 md:py-3">
                                    {s.cancelled ? (
                                      <span className="text-red-600">X</span>
                                    ) : s.completed ? (
                                      <span className="text-green-600">✓</span>
                                    ) : (
                                      <span className="text-blue-600">○</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Athletes List */}
                    {qr.type === 'athletes' && qr.data.athletes && (
                      <div className="overflow-x-auto">
                        {qr.data.athletes.length === 0 ? (
                          <p className="text-gray-700 text-center py-4 text-sm md:text-base">No athletes found</p>
                        ) : (
                          <table className="w-full text-left text-xs md:text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Name</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Email</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {qr.data.athletes.map((a) => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                  <td className="px-2 md:px-4 py-2 md:py-3 font-medium">{a.firstName} {a.lastName}</td>
                                  <td className="px-2 md:px-4 py-2 md:py-3 text-gray-700 truncate max-w-[150px] md:max-w-none">{a.email}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Count */}
                    {qr.type === 'count' && qr.data.count !== undefined && (
                      <div className="text-center py-6 md:py-8">
                        <span className="text-4xl md:text-5xl font-bold">{qr.data.count}</span>
                      </div>
                    )}

                    {/* Summary Stats */}
                    {qr.type === 'summary' && qr.data.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                        <div className="text-center p-3 md:p-4 bg-gray-50 rounded">
                          <div className="text-2xl md:text-3xl font-bold">{qr.data.summary.totalAthletes}</div>
                          <div className="text-xs md:text-sm text-gray-700">Athletes</div>
                        </div>
                        <div className="text-center p-3 md:p-4 bg-gray-50 rounded">
                          <div className="text-2xl md:text-3xl font-bold text-blue-600">{qr.data.summary.upcomingSessions}</div>
                          <div className="text-xs md:text-sm text-gray-700">Upcoming</div>
                        </div>
                        <div className="text-center p-3 md:p-4 bg-gray-50 rounded">
                          <div className="text-2xl md:text-3xl font-bold text-green-600">{qr.data.summary.completedSessions}</div>
                          <div className="text-xs md:text-sm text-gray-700">Completed</div>
                        </div>
                        <div className="text-center p-3 md:p-4 bg-gray-50 rounded">
                          <div className="text-2xl md:text-3xl font-bold">{qr.data.summary.totalSessions}</div>
                          <div className="text-xs md:text-sm text-gray-700">Total</div>
                        </div>
                      </div>
                    )}

                    {/* Check-ins List */}
                    {qr.type === 'checkIns' && qr.data.checkIns && (
                      <div className="overflow-x-auto">
                        {qr.data.checkIns.length === 0 ? (
                          <p className="text-gray-700 text-center py-4 text-sm md:text-base">No check-ins found</p>
                        ) : (
                          <table className="w-full text-left text-xs md:text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Athlete</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Time</th>
                                <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Match</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {qr.data.checkIns.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                  <td className="px-2 md:px-4 py-2 md:py-3 font-medium">{c.athleteName}</td>
                                  <td className="px-2 md:px-4 py-2 md:py-3">
                                    {new Date(c.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </td>
                                  <td className="px-2 md:px-4 py-2 md:py-3">
                                    {c.matchedSession ? (
                                      <span className="text-green-600">✓</span>
                                    ) : (
                                      <span className="text-yellow-600">−</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Attendance Report */}
                    {qr.type === 'attendanceReport' && qr.data.attendanceReport && (
                      <div>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                          <div className="text-center p-2 md:p-4 bg-gray-50 rounded">
                            <div className="text-xl md:text-3xl font-bold">{qr.data.attendanceReport.totalSessionsInPeriod}</div>
                            <div className="text-[10px] md:text-sm text-gray-700">Total</div>
                          </div>
                          <div className="text-center p-2 md:p-4 bg-green-50 rounded">
                            <div className="text-xl md:text-3xl font-bold text-green-600">{qr.data.attendanceReport.checkedInCount}</div>
                            <div className="text-[10px] md:text-sm text-gray-700">In</div>
                          </div>
                          <div className="text-center p-2 md:p-4 bg-red-50 rounded">
                            <div className="text-xl md:text-3xl font-bold text-red-600">{qr.data.attendanceReport.missedCount}</div>
                            <div className="text-[10px] md:text-sm text-gray-700">Missed</div>
                          </div>
                        </div>

                        {/* Athletes with missed sessions */}
                        {qr.data.attendanceReport.athletesWithMissedSessions.length === 0 ? (
                          <p className="text-gray-700 text-center py-4 text-sm md:text-base">All athletes checked in!</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <h4 className="font-medium mb-2 text-sm md:text-base">Missed check-ins:</h4>
                            <table className="w-full text-left text-xs md:text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Athlete</th>
                                  <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Miss</th>
                                  <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700 hidden sm:table-cell">Total</th>
                                  <th className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-700">Rate</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {qr.data.attendanceReport.athletesWithMissedSessions.map((a) => (
                                  <tr key={a.athleteId} className="hover:bg-gray-50">
                                    <td className="px-2 md:px-4 py-2 md:py-3 font-medium">{a.athleteName}</td>
                                    <td className="px-2 md:px-4 py-2 md:py-3 text-red-600">{a.missedCount}</td>
                                    <td className="px-2 md:px-4 py-2 md:py-3 hidden sm:table-cell">{a.totalSessions}</td>
                                    <td className="px-2 md:px-4 py-2 md:py-3">
                                      <span className={`font-medium ${
                                        ((a.totalSessions - a.missedCount) / a.totalSessions) >= 0.8
                                          ? 'text-green-600'
                                          : ((a.totalSessions - a.missedCount) / a.totalSessions) >= 0.5
                                          ? 'text-yellow-600'
                                          : 'text-red-600'
                                      }`}>
                                        {Math.round(((a.totalSessions - a.missedCount) / a.totalSessions) * 100)}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {/* Today's Sessions */}
          <div className="md:col-span-2 bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Today&apos;s Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-gray-700 text-sm md:text-base">No sessions scheduled for today</p>
            ) : (
              <ul className="space-y-2 md:space-y-3">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className={`flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 md:p-3 rounded gap-2 ${
                      session.completed ? 'bg-green-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-sm md:text-base">
                        {session.athlete.firstName} {session.athlete.lastName}
                      </span>
                      <span className="text-gray-700 text-xs md:text-sm">
                        {new Date(session.scheduledAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {session.completed ? (
                      <span className="text-green-600 font-medium text-xs md:text-sm">Completed</span>
                    ) : (
                      <button
                        onClick={() => handleComplete(session.id)}
                        className="px-2 md:px-3 py-1 bg-black text-white text-xs md:text-sm rounded self-start sm:self-auto"
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
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">My Athletes ({athletes.length})</h2>
            {athletes.length === 0 ? (
              <p className="text-gray-700 text-xs md:text-sm">No athletes yet. Try: &quot;Add athlete John Doe&quot;</p>
            ) : (
              <ul className="space-y-2">
                {athletes.map((athlete) => (
                  <li key={athlete.id} className="text-xs md:text-sm p-2 bg-gray-50 rounded">
                    <span className="font-medium">{athlete.firstName} {athlete.lastName}</span>
                    <span className="text-gray-600 text-[10px] md:text-xs block truncate">{athlete.email}</span>
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
