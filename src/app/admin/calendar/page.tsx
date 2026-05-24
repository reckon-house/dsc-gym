'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import {
  WeekGrid,
  startOfWeek,
  type GridSession,
} from '../_components/WeekGrid'
import {
  SessionEditSheet,
  type SessionDraft,
} from '../_components/SessionEditSheet'

interface TrainerOpt {
  id: string
  user: { name: string }
}
interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
  trainerId: string | null
}

export default function CalendarView() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [sessions, setSessions] = useState<GridSession[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<SessionDraft | null>(null)

  const loadSessions = useCallback(async (anchor: Date) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const res = await fetch(
      `/api/sessions?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    )
    const data = await res.json()
    if (!data.success) return
    setSessions(
      data.data.map((s: {
        id: string
        trainerId: string
        athleteId: string
        scheduledAt: string
        duration: number
        cancelled: boolean
        completed: boolean
        athlete: { firstName: string; lastName: string }
        trainer: { id: string; user: { name: string } }
        attendees?: { id: string; firstName: string; lastName: string }[]
      }) => ({
        id: s.id,
        athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
        trainerName: s.trainer.user.name,
        scheduledAt: s.scheduledAt,
        duration: s.duration,
        cancelled: s.cancelled,
        completed: s.completed,
        trainerId: s.trainerId,
        athleteId: s.athleteId,
        attendees: s.attendees ?? [],
      }))
    )
  }, [])

  const loadOptions = useCallback(async () => {
    const [t, a] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/athletes').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (a.success) {
      setAthletes(
        a.data.map((row: { id: string; firstName: string; lastName: string; trainerId: string | null }) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          trainerId: row.trainerId,
        }))
      )
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  useEffect(() => {
    loadSessions(weekStart)
  }, [weekStart, loadSessions])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  function handleSessionTap(session: GridSession) {
    setDraft({
      id: session.id,
      trainerId: session.trainerId,
      athleteId: session.athleteId,
      scheduledAt: session.scheduledAt,
      duration: session.duration,
      attendees: session.attendees,
    })
    setSheetOpen(true)
  }

  function handleAddTap(date: Date) {
    // Default new sessions to 9am on the chosen day.
    const at = new Date(date)
    at.setHours(9, 0, 0, 0)
    setDraft({
      scheduledAt: at.toISOString(),
      duration: 60,
    })
    setSheetOpen(true)
  }

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Calendar" />
      <WeekGrid
        weekStart={weekStart}
        sessions={sessions}
        proposals={[]}
        onWeekChange={setWeekStart}
        onSessionTap={handleSessionTap}
        onAddTap={handleAddTap}
      />
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-black/50 max-w-md mx-auto">
          Tap a session to edit, the <span className="font-semibold">+</span> to
          add. Or go to{' '}
          <span className="font-semibold text-black">Chat / Schedule</span> for
          bulk changes.
        </p>
      </div>

      <SessionEditSheet
        open={sheetOpen}
        initial={draft}
        trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
        athletes={athletes}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          loadSessions(weekStart)
        }}
      />
    </div>
  )
}
