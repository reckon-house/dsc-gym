'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import {
  WeekCards,
  startOfWeek,
  dateKey,
  type CardSession,
  type CardMeeting,
} from '../_components/WeekCards'

interface TrainerOpt {
  id: string
  user: { name: string }
}

export default function CalendarView() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [sessions, setSessions] = useState<CardSession[]>([])
  const [meetings, setMeetings] = useState<CardMeeting[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  // '' = everyone. The API has supported ?trainerId= all along; this just
  // gives the owner a way to reach it without asking the scheduler.
  const [trainerId, setTrainerId] = useState('')

  const loadSessions = useCallback(async (anchor: Date, filterTrainerId: string) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const qs = new URLSearchParams({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })
    if (filterTrainerId) qs.set('trainerId', filterTrainerId)
    const res = await fetch(`/api/sessions?${qs.toString()}`)
    const data = await res.json()
    if (!data.success) return
    setSessions(
      data.data.map((s: {
        id: string
        trainerId: string
        scheduledAt: string
        duration: number
        cancelled: boolean
        athlete: { firstName: string; lastName: string } | null
        trainer: { user: { name: string } }
        attendees?: { id: string; firstName: string; lastName: string }[]
      }) => ({
        id: s.id,
        trainerId: s.trainerId,
        scheduledAt: s.scheduledAt,
        athleteName: s.athlete ? `${s.athlete.firstName} ${s.athlete.lastName}` : null,
        trainerName: s.trainer.user.name,
        duration: s.duration,
        cancelled: s.cancelled,
        attendees: s.attendees,
      }))
    )
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
    fetch('/api/trainers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTrainers(d.data)
      })
  }, [router])

  const loadMeetings = useCallback(async (anchor: Date, filterTrainerId: string) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const res = await fetch(
      `/api/admin/calendar-events?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    )
    const data = await res.json()
    if (!data.success) return
    const all: CardMeeting[] = data.data.map(
      (e: { id: string; title: string; startsAt: string; duration: number; trainerIds: string[] }) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        duration: e.duration,
        trainerIds: e.trainerIds,
      })
    )
    // An all-staff meeting (empty trainerIds) blocks everyone, so it stays
    // visible no matter who the filter is narrowed to.
    setMeetings(
      filterTrainerId
        ? all.filter((m) => m.trainerIds.length === 0 || m.trainerIds.includes(filterTrainerId))
        : all
    )
  }, [])

  useEffect(() => {
    loadSessions(weekStart, trainerId)
    loadMeetings(weekStart, trainerId)
  }, [weekStart, trainerId, loadSessions, loadMeetings])

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Calendar" />
      <div className="max-w-3xl mx-auto w-full">
        <div className="px-4 pt-3 flex items-center gap-2">
          <span className="dsc-label text-black/40 shrink-0">Showing</span>
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            className="flex-1 h-10 px-3 bg-black/[0.04] rounded-full text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <option value="">All trainers</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.name}
              </option>
            ))}
          </select>
        </div>
        <WeekCards
          weekStart={weekStart}
          sessions={sessions}
          meetings={meetings}
          // Carry the filter into the day view so tapping a day keeps context.
          hrefFor={(d) =>
            `/admin/calendar/${dateKey(d)}${trainerId ? `?trainerId=${trainerId}` : ''}`
          }
          onWeekChange={setWeekStart}
        />
      </div>
    </div>
  )
}
