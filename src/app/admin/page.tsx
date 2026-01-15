'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TrainerData {
  id: string
  user: {
    name: string
    email: string
  }
  totalAthletes: number
  todaySessions: Array<{
    id: string
    scheduledAt: string
    completed: boolean
    athlete: {
      firstName: string
      lastName: string
    }
  }>
  todayStats: {
    total: number
    completed: number
    remaining: number
  }
}

interface ParsedAction {
  operations: Array<{
    model: string
    method: string
    args: Record<string, unknown>
    description: string
  }>
  humanReadableSummary: string
  clarificationNeeded: string | null
  isQuery: boolean
}

interface PendingAction {
  parsed: ParsedAction
  input: string
  isDestructive: boolean
}

interface ActionHistory {
  input: string
  parsed: ParsedAction
  timestamp: Date
  undoOperations?: Array<{
    model: string
    method: string
    args: Record<string, unknown>
  }>
}

interface QueryResult {
  id: string
  type: 'athletes' | 'sessions' | 'trainers' | 'generic'
  data: unknown[]
  message: string
  expanded: boolean
  timestamp: Date
}

export default function AdminDashboard() {
  const [trainers, setTrainers] = useState<TrainerData[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [queryResults, setQueryResults] = useState<QueryResult[]>([])
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [lastAction, setLastAction] = useState<ActionHistory | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchUser()
    fetchTrainers()
  }, [])

  // Auto-refresh every 10 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchTrainers()
    }, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function fetchUser() {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    if (data.success) {
      setUser(data.user)
    }
  }

  async function fetchTrainers() {
    const res = await fetch('/api/trainers')
    const data = await res.json()
    if (data.success) {
      setTrainers(data.data)
      setLastRefresh(new Date())
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Check if action is destructive (delete, cancel, remove)
  function isDestructiveAction(parsed: ParsedAction): boolean {
    if (!parsed.operations) return false
    return parsed.operations.some(op =>
      op.method === 'delete' ||
      op.method === 'deleteMany' ||
      op.description?.toLowerCase().includes('delete') ||
      op.description?.toLowerCase().includes('remove') ||
      op.description?.toLowerCase().includes('cancel')
    )
  }

  // Determine the type of query result for proper display
  function determineQueryType(parsed: ParsedAction, data: unknown[]): QueryResult['type'] {
    if (!parsed.operations || parsed.operations.length === 0) return 'generic'
    const model = parsed.operations[0].model.toLowerCase()
    if (model === 'athlete') return 'athletes'
    if (model === 'session') return 'sessions'
    if (model === 'trainer' || model === 'user') return 'trainers'
    return 'generic'
  }

  // Preview the command first (don't execute)
  async function handlePreview() {
    if (!input.trim()) return

    setLoading(true)
    setResult(null)
    setPendingAction(null)

    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, execute: false }),
      })
      const data = await res.json()

      if (data.success && data.parsed) {
        const parsed = data.parsed as ParsedAction

        if (parsed.clarificationNeeded) {
          setResult({ success: false, message: parsed.clarificationNeeded })
          return
        }

        const destructive = isDestructiveAction(parsed)

        // For queries, execute immediately
        if (parsed.isQuery) {
          await executeAction(parsed, input)
        } else if (destructive) {
          // Destructive actions need confirmation
          setPendingAction({
            parsed,
            input,
            isDestructive: true,
          })
        } else {
          // Non-destructive mutations - execute immediately
          await executeAction(parsed, input)
        }
      } else {
        setResult({
          success: false,
          message: data.error || 'Could not understand that command',
        })
      }
    } catch (error) {
      console.error('Preview error:', error)
      setResult({ success: false, message: 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  // Execute the pending action
  async function executeAction(parsed: ParsedAction, originalInput: string) {
    setLoading(true)

    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalInput, execute: true }),
      })
      const data = await res.json()

      if (data.success && data.execution?.success) {
        // Handle query results
        if (parsed.isQuery && data.execution.data?.items) {
          const items = data.execution.data.items as unknown[]
          const queryType = determineQueryType(parsed, items)
          const newResult: QueryResult = {
            id: `query-${Date.now()}`,
            type: queryType,
            data: items,
            message: data.execution.message || parsed.humanReadableSummary,
            expanded: true,
            timestamp: new Date(),
          }
          setQueryResults(prev => [newResult, ...prev])
          setResult(null)
        } else {
          setResult({
            success: true,
            message: data.execution.message || parsed.humanReadableSummary || 'Done!'
          })
        }

        // Store for undo (only non-query actions)
        if (!parsed.isQuery) {
          setLastAction({
            input: originalInput,
            parsed,
            timestamp: new Date(),
            undoOperations: data.execution.undoOperations,
          })
        }

        setInput('')
        setPendingAction(null)
        if (!parsed.isQuery) {
          fetchTrainers()
        }
      } else {
        setResult({
          success: false,
          message: data.execution?.message || data.error || 'Command failed'
        })
      }
    } catch (error) {
      console.error('Execute error:', error)
      setResult({ success: false, message: 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  // Confirm and execute pending action
  async function handleConfirm() {
    if (!pendingAction) return
    await executeAction(pendingAction.parsed, pendingAction.input)
  }

  // Cancel pending action
  function handleCancel() {
    setPendingAction(null)
    setResult(null)
  }

  // Undo last action
  async function handleUndo() {
    if (!lastAction) return

    setLoading(true)
    try {
      const res = await fetch('/api/admin/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalAction: lastAction.parsed,
          undoOperations: lastAction.undoOperations
        }),
      })
      const data = await res.json()

      if (data.success) {
        setResult({ success: true, message: `Undone: ${lastAction.parsed.humanReadableSummary}` })
        setLastAction(null)
        fetchTrainers()
      } else {
        setResult({ success: false, message: data.error || 'Could not undo' })
      }
    } catch (error) {
      console.error('Undo error:', error)
      setResult({ success: false, message: 'Failed to undo' })
    } finally {
      setLoading(false)
    }
  }

  // Toggle query result expanded/collapsed
  function toggleQueryResult(id: string) {
    setQueryResults(prev =>
      prev.map(qr =>
        qr.id === id ? { ...qr, expanded: !qr.expanded } : qr
      )
    )
  }

  // Remove a query result
  function removeQueryResult(id: string) {
    setQueryResults(prev => prev.filter(qr => qr.id !== id))
  }

  // Clear all query results
  function clearAllQueryResults() {
    setQueryResults([])
  }

  // Format date for display
  function formatDateTime(dateStr: string) {
    const date = new Date(dateStr)
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    }
  }

  // Calculate totals
  const totalSessionsToday = trainers.reduce((sum, t) => sum + t.todayStats.total, 0)
  const completedToday = trainers.reduce((sum, t) => sum + t.todayStats.completed, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-black text-white p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">DSC Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => fetchTrainers()}
                className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700"
                title="Refresh now"
              >
                Refresh
              </button>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-300">Auto</span>
              </label>
              <span className="text-gray-400 text-xs">
                {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
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

      <main className="max-w-7xl mx-auto p-6">
        {/* Command Input */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Admin Commands</h2>
          <p className="text-sm text-gray-500 mb-3">
            Try: &quot;Show all athletes&quot; &bull; &quot;Show today&apos;s schedule&quot; &bull; &quot;Sessions this week&quot; &bull; &quot;Add trainer Jack White&quot;
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (pendingAction) {
                  handleConfirm()
                } else if (input.trim()) {
                  handlePreview()
                }
              } else if (e.key === 'Escape' && pendingAction) {
                handleCancel()
              }
            }}
            placeholder="Type your command here... (Press Enter to execute, Shift+Enter for new line)"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black"
            rows={2}
            disabled={!!pendingAction}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-3">
            {!pendingAction ? (
              <>
                <button
                  onClick={handlePreview}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Execute'}
                </button>
                {lastAction && (
                  <button
                    onClick={handleUndo}
                    disabled={loading}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    Undo Last
                  </button>
                )}
                {queryResults.length > 0 && (
                  <button
                    onClick={clearAllQueryResults}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
                  >
                    Clear All Results
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                    pendingAction.isDestructive
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {loading ? 'Executing...' : 'Confirm'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          {/* Pending action confirmation */}
          {pendingAction && (
            <div className={`mt-4 p-4 rounded-lg ${
              pendingAction.isDestructive ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
            }`}>
              <p className={`font-medium ${pendingAction.isDestructive ? 'text-red-800' : 'text-blue-800'}`}>
                {pendingAction.isDestructive ? '⚠️ Destructive Action' : 'Confirm Action'}
              </p>
              <p className={`mt-1 ${pendingAction.isDestructive ? 'text-red-700' : 'text-blue-700'}`}>
                {pendingAction.parsed.humanReadableSummary}
              </p>
              {pendingAction.parsed.operations && (
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                  {pendingAction.parsed.operations.map((op, i) => (
                    <li key={i}>{op.description}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Result message */}
          {result && !pendingAction && (
            <div className={`mt-4 p-3 rounded ${
              result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.message}
            </div>
          )}

          {/* Last action indicator */}
          {lastAction && !pendingAction && (
            <div className="mt-3 text-sm text-gray-500">
              Last action: {lastAction.parsed.humanReadableSummary}
              <span className="text-gray-400 ml-2">
                ({new Date(lastAction.timestamp).toLocaleTimeString()})
              </span>
            </div>
          )}
        </div>

        {/* Query Results Display - Multiple Cards with Accordion */}
        {queryResults.length > 0 && (
          <div className="space-y-4 mb-6">
            {queryResults.map((qr) => (
              <div key={qr.id} className="bg-white rounded-lg shadow">
                {/* Card Header with controls */}
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleQueryResult(qr.id)}
                      className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-lg"
                      title={qr.expanded ? 'Collapse' : 'Expand'}
                    >
                      {qr.expanded ? '−' : '+'}
                    </button>
                    <div>
                      <h3 className="font-semibold">{qr.message}</h3>
                      <span className="text-sm text-gray-500">
                        {qr.data.length} result(s) • {qr.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeQueryResult(qr.id)}
                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 text-xl"
                    title="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Card Content - Collapsible */}
                {qr.expanded && (
                  <div className="p-4">
                    {/* Athletes Table */}
                    {qr.type === 'athletes' && qr.data.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 font-medium text-gray-700">Name</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Email</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Trainer</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {qr.data.map((athlete: any, i) => (
                              <tr key={athlete.id || i} className="hover:bg-gray-50">
                                <td className="px-4 py-3">{athlete.firstName} {athlete.lastName}</td>
                                <td className="px-4 py-3 text-gray-500">{athlete.email}</td>
                                <td className="px-4 py-3 text-gray-500">
                                  {athlete.trainer?.user?.name || 'Unassigned'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Sessions Table */}
                    {qr.type === 'sessions' && qr.data.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 font-medium text-gray-700">Date</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Time</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Athlete</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Trainer</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {qr.data.map((session: any, i) => {
                              const { date, time } = formatDateTime(session.scheduledAt)
                              return (
                                <tr key={session.id || i} className="hover:bg-gray-50">
                                  <td className="px-4 py-3">{date}</td>
                                  <td className="px-4 py-3">{time}</td>
                                  <td className="px-4 py-3">
                                    {session.athlete?.firstName} {session.athlete?.lastName}
                                  </td>
                                  <td className="px-4 py-3 text-gray-500">
                                    {session.trainer?.user?.name}
                                  </td>
                                  <td className="px-4 py-3">
                                    {session.cancelled ? (
                                      <span className="text-red-600">Cancelled</span>
                                    ) : session.completed ? (
                                      <span className="text-green-600">Completed</span>
                                    ) : (
                                      <span className="text-blue-600">Scheduled</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Trainers Table */}
                    {qr.type === 'trainers' && qr.data.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 font-medium text-gray-700">Name</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Email</th>
                              <th className="px-4 py-3 font-medium text-gray-700">Athletes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {qr.data.map((trainer: any, i) => (
                              <tr key={trainer.id || i} className="hover:bg-gray-50">
                                <td className="px-4 py-3">{trainer.user?.name || trainer.name}</td>
                                <td className="px-4 py-3 text-gray-500">{trainer.user?.email || trainer.email}</td>
                                <td className="px-4 py-3 text-gray-500">
                                  {trainer._count?.athletes ?? trainer.athletes?.length ?? '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Generic Results */}
                    {qr.type === 'generic' && qr.data.length > 0 && (
                      <div className="bg-gray-50 rounded p-4 overflow-auto max-h-96">
                        <pre className="text-sm">{JSON.stringify(qr.data, null, 2)}</pre>
                      </div>
                    )}

                    {qr.data.length === 0 && (
                      <p className="text-gray-500 text-center py-8">No results found</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold">{trainers.length}</div>
            <div className="text-gray-500">Trainers</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold">{totalSessionsToday}</div>
            <div className="text-gray-500">Sessions Today</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-green-600">{completedToday}</div>
            <div className="text-gray-500">Completed</div>
          </div>
        </div>

        {/* Trainer Grid */}
        <h2 className="text-lg font-semibold mb-4">All Trainers</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trainers.map((trainer) => (
            <div key={trainer.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold">{trainer.user.name}</h3>
                  <p className="text-sm text-gray-500">{trainer.user.email}</p>
                </div>
                <div className="text-right">
                  <span className="text-green-600 font-bold">
                    {trainer.todayStats.completed}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span>{trainer.todayStats.total}</span>
                </div>
              </div>

              <div className="text-sm text-gray-500 mb-3">
                {trainer.totalAthletes} athletes
              </div>

              {/* Today's Sessions */}
              {trainer.todaySessions.length > 0 ? (
                <ul className="space-y-2">
                  {trainer.todaySessions.slice(0, 5).map((session) => (
                    <li
                      key={session.id}
                      className={`text-sm flex justify-between ${
                        session.completed ? 'text-green-600' : 'text-gray-700'
                      }`}
                    >
                      <span>
                        {session.athlete.firstName} {session.athlete.lastName}
                      </span>
                      <span>
                        {new Date(session.scheduledAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {session.completed && ' ✓'}
                      </span>
                    </li>
                  ))}
                  {trainer.todaySessions.length > 5 && (
                    <li className="text-sm text-gray-400">
                      +{trainer.todaySessions.length - 5} more
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No sessions today</p>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
