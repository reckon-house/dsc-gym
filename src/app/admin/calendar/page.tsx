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
  type CardTimeOff,
} from '../_components/WeekCards'
import { TimeOffSheet } from '@/components/TimeOffSheet'
import { useLocations } from '@/components/useLocations'

interface TrainerOpt {
  id: string
  user: { name: string }
}

export default function CalendarView() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [sessions, setSessions] = useState<CardSession[]>([])
  const [meetings, setMeetings] = useState<CardMeeting[]>([])
  const [timeOff, setTimeOff] = useState<CardTimeOff[]>([])
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  // '' = everyone. The API has supported ?trainerId= all along; this just
  // gives the owner a way to reach it without asking the scheduler.
  const [trainerId, setTrainerId] = useState('')
  // '' = both gyms; 'none' = sessions nobody has tagged yet.
  const [location, setLocation] = useState('')
  const locations = useLocations()

  const loadSessions = useCallback(async (anchor: Date, filterTrainerId: string, filterLocation: string) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const qs = new URLSearchParams({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })
    if (filterTrainerId) qs.set('trainerId', filterTrainerId)
    if (filterLocation) qs.set('location', filterLocation)
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

  const loadTimeOff = useCallback(async (anchor: Date, filterTrainerId: string) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const qs = new URLSearchParams({ status: 'approved', from: dateKey(start), to: dateKey(end) })
    if (filterTrainerId) qs.set('trainerId', filterTrainerId)
    const res = await fetch(`/api/time-off?${qs.toString()}`)
    const data = await res.json()
    if (data.success) setTimeOff(data.data)
  }, [])

  useEffect(() => {
    loadSessions(weekStart, trainerId, location)
    loadMeetings(weekStart, trainerId)
    loadTimeOff(weekStart, trainerId)
  }, [weekStart, trainerId, location, loadSessions, loadMeetings, loadTimeOff])

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Calendar" />
      <div className="max-w-3xl mx-auto w-full">
        <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
          <span className="dsc-label text-black/40 shrink-0 hidden sm:inline">Showing</span>
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            aria-label="Trainer"
            className="flex-1 min-w-[8rem] h-10 px-3 bg-black/[0.04] rounded-full text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <option value="">All trainers</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.name}
              </option>
            ))}
          </select>
          {locations.length > 0 && (
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Location"
              className="h-10 px-3 bg-black/[0.04] rounded-full text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 max-w-[9rem]"
            >
              <option value="">Both gyms</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="none">Not tagged</option>
            </select>
          )}
          <button
            onClick={() => setTimeOffOpen(true)}
            className="h-10 px-4 rounded-full bg-black/[0.04] text-sm text-black shrink-0 hover:bg-black/[0.08]"
          >
            + Time off
          </button>
        </div>
        <WeekCards
          timeOff={timeOff}
          weekStart={weekStart}
          sessions={sessions}
          meetings={meetings}
          // Carry the filter into the day view so tapping a day keeps context.
          hrefFor={(d) =>
            `/admin/calendar/${dateKey(d)}${(() => {
              const q = new URLSearchParams()
              if (trainerId) q.set('trainerId', trainerId)
              if (location) q.set('location', location)
              const str = q.toString()
              return str ? `?${str}` : ''
            })()}`
          }
          onWeekChange={setWeekStart}
        />
        <TimeOffSheet
          open={timeOffOpen}
          onClose={() => setTimeOffOpen(false)}
          onSaved={() => loadTimeOff(weekStart, trainerId)}
          coaches={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
        />
      </div>
    </div>
  )
}
