'use client'

// The master schedule: the whole gym's week, visible to every coach and admin.
// For awareness — who's on, where, who's off — not for editing; admins still
// change things from the admin calendar.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { WeekCards, startOfWeek, dateKey, type CardSession, type CardMeeting, type CardTimeOff } from '../admin/_components/WeekCards'
import { useLocations } from '@/components/useLocations'
import { homeFor, useStaff } from './useStaff'

interface ApiSession {
  id: string
  trainerId: string
  scheduledAt: string
  duration: number
  cancelled: boolean
  athlete: { firstName: string; lastName: string } | null
  trainer: { user: { name: string } }
  attendees?: { id: string; firstName: string; lastName: string }[]
}

export default function MasterSchedule() {
  const user = useStaff()
  const locations = useLocations()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [sessions, setSessions] = useState<CardSession[]>([])
  const [meetings, setMeetings] = useState<CardMeeting[]>([])
  const [timeOff, setTimeOff] = useState<CardTimeOff[]>([])
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([])
  const [coach, setCoach] = useState('')
  const [location, setLocation] = useState('')

  useEffect(() => {
    fetch('/api/trainers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTrainers(d.data.map((t: { id: string; user: { name: string } }) => ({ id: t.id, name: t.user.name })))
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async (anchor: Date, coachId: string, loc: string) => {
    const start = startOfWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const last = new Date(start)
    last.setDate(last.getDate() + 6)
    const qs = new URLSearchParams({ scope: 'all', startDate: start.toISOString(), endDate: end.toISOString() })
    if (coachId) qs.set('trainerId', coachId)
    if (loc) qs.set('location', loc)
    const offQs = new URLSearchParams({ scope: 'all', status: 'approved', from: dateKey(start), to: dateKey(last) })
    if (coachId) offQs.set('trainerId', coachId)

    const [s, m, t] = await Promise.all([
      fetch(`/api/sessions?${qs}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/admin/calendar-events?startDate=${start.toISOString()}&endDate=${end.toISOString()}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/time-off?${offQs}`).then((r) => r.json()).catch(() => null),
    ])
    if (s?.success) {
      setSessions(
        (s.data as ApiSession[]).map((x) => ({
          id: x.id,
          trainerId: x.trainerId,
          scheduledAt: x.scheduledAt,
          athleteName: x.athlete ? `${x.athlete.firstName} ${x.athlete.lastName}` : null,
          trainerName: x.trainer.user.name,
          duration: x.duration,
          cancelled: x.cancelled,
          attendees: x.attendees,
        }))
      )
    }
    if (m?.success) {
      const all: CardMeeting[] = m.data
      setMeetings(coachId ? all.filter((e) => e.trainerIds.length === 0 || e.trainerIds.includes(coachId)) : all)
    }
    if (t?.success) setTimeOff(t.data)
  }, [])

  useEffect(() => {
    if (user) load(weekStart, coach, location)
  }, [user, weekStart, coach, location, load])

  const dayQuery = () => {
    const q = new URLSearchParams()
    if (coach) q.set('coach', coach)
    if (location) q.set('location', location)
    const s = q.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href={homeFor(user)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
          aria-label="Back to home"
        >
          ←
        </Link>
        <div className="dsc-headline text-lg md:text-xl text-black">Gym schedule</div>
      </header>
      <div className="max-w-3xl mx-auto w-full">
        <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
          <select
            value={coach}
            onChange={(e) => setCoach(e.target.value)}
            aria-label="Coach"
            className="flex-1 min-w-[8rem] h-10 px-3 bg-black/[0.04] rounded-full text-sm text-black"
          >
            <option value="">Every coach</option>
            {user?.trainerId && <option value={user.trainerId}>Just me</option>}
            {trainers
              .filter((t) => t.id !== user?.trainerId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          {locations.length > 0 && (
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Gym"
              className="h-10 px-3 bg-black/[0.04] rounded-full text-sm text-black max-w-[9rem]"
            >
              <option value="">Both gyms</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>
        <WeekCards
          weekStart={weekStart}
          sessions={sessions}
          meetings={meetings}
          timeOff={timeOff}
          hrefFor={(d) => `/schedule/${dateKey(d)}${dayQuery()}`}
          onWeekChange={setWeekStart}
        />
      </div>
    </div>
  )
}
