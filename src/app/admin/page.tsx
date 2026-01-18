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
  athletes: Array<{
    id: string
    firstName: string
    lastName: string
    email: string
  }>
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

interface SessionData {
  id: string
  scheduledAt: string
  completed: boolean
  cancelled: boolean
  athlete: {
    firstName: string
    lastName: string
  }
  trainer: {
    user: {
      name: string
    }
  }
}

interface WalkIn {
  id: string
  name: string
  email: string | null
  checkInTime: string
}

type CalendarView = 'day' | 'week' | 'month'

export default function AdminDashboard() {
  const [trainers, setTrainers] = useState<TrainerData[]>([])
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [walkIns, setWalkIns] = useState<WalkIn[]>([])
  const [assigningWalkIn, setAssigningWalkIn] = useState<string | null>(null)
  const router = useRouter()

  // Command input state
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Accordion states
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [trainersOpen, setTrainersOpen] = useState(false)
  const [athletesOpen, setAthletesOpen] = useState(false)

  // Calendar view state
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    fetchUser()
    fetchTrainers()
    fetchWalkIns()
    fetchSessions()
  }, [])

  // Refetch sessions when calendar view or date changes
  useEffect(() => {
    fetchSessions()
  }, [calendarView, currentDate])

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
    }
  }

  async function fetchWalkIns() {
    const res = await fetch('/api/walkins')
    const data = await res.json()
    if (data.success) {
      setWalkIns(data.data)
    }
  }

  async function fetchSessions() {
    const { start, end } = getDateRange()
    const res = await fetch(`/api/sessions?start=${start.toISOString()}&end=${end.toISOString()}`)
    const data = await res.json()
    if (data.success) {
      setSessions(data.data)
    }
  }

  function getDateRange() {
    const start = new Date(currentDate)
    const end = new Date(currentDate)

    if (calendarView === 'day') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (calendarView === 'week') {
      const dayOfWeek = start.getDay()
      start.setDate(start.getDate() - dayOfWeek)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
    } else {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
    }

    return { start, end }
  }

  async function assignWalkIn(walkInId: string, trainerId: string) {
    setAssigningWalkIn(walkInId)
    try {
      const res = await fetch(`/api/walkins/${walkInId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainerId }),
      })
      const data = await res.json()
      if (data.success) {
        fetchWalkIns()
        fetchTrainers()
      }
    } catch (error) {
      console.error('Error assigning walk-in:', error)
    } finally {
      setAssigningWalkIn(null)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function handleCommand() {
    if (!input.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, execute: true }),
      })
      const data = await res.json()

      if (data.success) {
        const message = data.execution?.message || data.parsed?.humanReadableSummary || 'Done!'
        setResult({ success: true, message })
        setInput('')
        // Refresh data
        fetchTrainers()
        fetchSessions()
        fetchWalkIns()
      } else {
        setResult({
          success: false,
          message: data.error || data.parsed?.clarificationNeeded || 'Command failed'
        })
      }
    } catch (error) {
      console.error('Command error:', error)
      setResult({ success: false, message: 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  // Get all athletes from all trainers
  const allAthletes = trainers.flatMap(t =>
    t.athletes?.map(a => ({ ...a, trainerName: t.user.name })) || []
  )

  // Group sessions by date for calendar display
  function groupSessionsByDate(sessions: SessionData[]) {
    const grouped: Record<string, SessionData[]> = {}
    sessions.forEach(session => {
      const date = new Date(session.scheduledAt).toDateString()
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(session)
    })
    return grouped
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  function formatDateHeader() {
    if (calendarView === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    } else if (calendarView === 'week') {
      const { start, end } = getDateRange()
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
  }

  function navigateDate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate)
    if (calendarView === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    }
    setCurrentDate(newDate)
  }

  const groupedSessions = groupSessionsByDate(sessions)

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-black tracking-tight">DSC ADMIN</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm bg-white text-black px-3 py-1 rounded font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Walk-ins Alert */}
      {walkIns.length > 0 && (
        <div className="bg-orange-500 text-white p-4">
          <div className="max-w-4xl mx-auto">
            <div className="font-bold mb-2">WALK-INS ({walkIns.length})</div>
            <div className="space-y-2">
              {walkIns.map((walkIn) => (
                <div key={walkIn.id} className="flex items-center justify-between bg-white/10 rounded p-2">
                  <span>{walkIn.name} - {new Date(walkIn.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <select
                    className="bg-white text-black rounded px-2 py-1 text-sm"
                    defaultValue=""
                    onChange={(e) => e.target.value && assignWalkIn(walkIn.id, e.target.value)}
                    disabled={assigningWalkIn === walkIn.id}
                  >
                    <option value="" disabled>Assign...</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>{t.user.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto py-8 px-4">
        {/* Command Input */}
        <div className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleCommand()
                }
              }}
              placeholder="Type a command... (e.g., 'Show all athletes', 'Add trainer John Doe')"
              className="flex-1 px-4 py-3 border-2 border-black rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-black"
              disabled={loading}
            />
            <button
              onClick={handleCommand}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Go'}
            </button>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg ${
              result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {result.message}
            </div>
          )}
        </div>

        {/* CALENDAR Accordion */}
        <div className="border-b-4 border-black">
          <button
            onClick={() => setCalendarOpen(!calendarOpen)}
            className="w-full flex justify-between items-center py-6 px-4"
          >
            <span className="text-3xl font-black tracking-tight">CALENDAR</span>
            <span className="text-3xl font-light">{calendarOpen ? '−' : '+'}</span>
          </button>

          {calendarOpen && (
            <div className="px-4 pb-6">
              {/* View Toggle */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {(['day', 'week', 'month'] as CalendarView[]).map((view) => (
                    <button
                      key={view}
                      onClick={() => setCalendarView(view)}
                      className={`px-4 py-2 text-sm font-medium rounded ${
                        calendarView === view
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => navigateDate('prev')} className="p-2 hover:bg-gray-100 rounded">
                    &larr;
                  </button>
                  <span className="font-medium min-w-[200px] text-center">{formatDateHeader()}</span>
                  <button onClick={() => navigateDate('next')} className="p-2 hover:bg-gray-100 rounded">
                    &rarr;
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Sessions List */}
              <div className="space-y-4">
                {Object.keys(groupedSessions).length === 0 ? (
                  <p className="text-gray-500 py-8 text-center">No sessions in this period</p>
                ) : (
                  Object.entries(groupedSessions)
                    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                    .map(([date, daySessions]) => (
                      <div key={date} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 font-medium">
                          {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="divide-y">
                          {daySessions
                            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                            .map((session) => (
                              <div key={session.id} className="px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <span className="font-mono text-sm w-20">{formatTime(session.scheduledAt)}</span>
                                  <span className="font-medium">
                                    {session.athlete.firstName} {session.athlete.lastName}
                                  </span>
                                  <span className="text-gray-500 text-sm">
                                    with {session.trainer.user.name}
                                  </span>
                                </div>
                                <span className={`text-sm font-medium ${
                                  session.cancelled ? 'text-red-600' :
                                  session.completed ? 'text-green-600' : 'text-gray-400'
                                }`}>
                                  {session.cancelled ? 'Cancelled' : session.completed ? 'Done' : 'Scheduled'}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* TRAINERS Accordion */}
        <div className="border-b-4 border-black">
          <button
            onClick={() => setTrainersOpen(!trainersOpen)}
            className="w-full flex justify-between items-center py-6 px-4"
          >
            <span className="text-3xl font-black tracking-tight">TRAINERS</span>
            <span className="text-3xl font-light">{trainersOpen ? '−' : '+'}</span>
          </button>

          {trainersOpen && (
            <div className="px-4 pb-6">
              <div className="space-y-3">
                {trainers.map((trainer) => (
                  <div key={trainer.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">{trainer.user.name}</div>
                        <div className="text-gray-500 text-sm">{trainer.user.email}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{trainer.totalAthletes}</div>
                        <div className="text-gray-500 text-xs">athletes</div>
                      </div>
                    </div>
                    {trainer.todaySessions.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm text-gray-500 mb-2">Today&apos;s Sessions</div>
                        <div className="flex flex-wrap gap-2">
                          {trainer.todaySessions.map((session) => (
                            <span
                              key={session.id}
                              className={`text-xs px-2 py-1 rounded ${
                                session.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {session.athlete.firstName} {formatTime(session.scheduledAt)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ATHLETES Accordion */}
        <div className="border-b-4 border-black">
          <button
            onClick={() => setAthletesOpen(!athletesOpen)}
            className="w-full flex justify-between items-center py-6 px-4"
          >
            <span className="text-3xl font-black tracking-tight">ATHLETES</span>
            <span className="text-3xl font-light">{athletesOpen ? '−' : '+'}</span>
          </button>

          {athletesOpen && (
            <div className="px-4 pb-6">
              <div className="mb-4 text-gray-500">{allAthletes.length} athletes total</div>
              <div className="space-y-2">
                {allAthletes.map((athlete) => (
                  <div key={athlete.id} className="border rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{athlete.firstName} {athlete.lastName}</div>
                      <div className="text-gray-500 text-sm">{athlete.email}</div>
                    </div>
                    <div className="text-gray-500 text-sm">
                      {athlete.trainerName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
