'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import {
  WeekCards,
  startOfWeek,
  dateKey,
  type CardSession,
} from '../_components/WeekCards'

export default function CalendarView() {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [sessions, setSessions] = useState<CardSession[]>([])

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
        scheduledAt: string
        duration: number
        cancelled: boolean
        athlete: { firstName: string; lastName: string }
        trainer: { user: { name: string } }
      }) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
        trainerName: s.trainer.user.name,
        duration: s.duration,
        cancelled: s.cancelled,
      }))
    )
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

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Calendar" />
      <div className="max-w-3xl mx-auto w-full">
        <WeekCards
          weekStart={weekStart}
          sessions={sessions}
          hrefFor={(d) => `/admin/calendar/${dateKey(d)}`}
          onWeekChange={setWeekStart}
        />
      </div>
    </div>
  )
}
