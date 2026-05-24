'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'

interface TrainerCard {
  id: string
  user: { name: string; email: string }
  totalAthletes: number
  athletes: { id: string; firstName: string; lastName: string }[]
  todaySessions: { id: string; scheduledAt: string }[]
  availability: { dayOfWeek: number; startMinute: number; endMinute: number }[]
  todayStats: { total: number; completed: number; remaining: number }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtMinute(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  const ampm = h < 12 ? 'am' : 'pm'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(min).padStart(2, '0')}${ampm}`
}

type AvailabilityRow = TrainerCard['availability'][number]

export default function TrainersView() {
  const router = useRouter()
  const [trainers, setTrainers] = useState<TrainerCard[]>([])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/trainers')
      const data = await res.json()
      if (data.success) setTrainers(data.data)
    })()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Trainers" />

      <div className="px-4 py-4 max-w-3xl mx-auto space-y-3">
        {trainers.length === 0 && (
          <div className="text-center py-12 text-black/40 text-sm">
            No trainers yet.
          </div>
        )}
        {trainers.map((t) => {
          const av = t.availability ?? []
          const byDay = new Map<number, AvailabilityRow[]>()
          for (const row of av) {
            const list = byDay.get(row.dayOfWeek) ?? []
            list.push(row)
            byDay.set(row.dayOfWeek, list)
          }

          return (
            <div
              key={t.id}
              className="rounded-2xl border border-black/10 p-4 md:p-5 bg-white"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="dsc-headline text-xl md:text-2xl text-black">
                    {t.user.name}
                  </div>
                  <div className="text-sm text-black/50 mt-0.5">
                    {t.user.email}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="dsc-headline text-3xl text-black">
                    {t.totalAthletes}
                  </div>
                  <div className="dsc-label text-black/50">athletes</div>
                </div>
              </div>

              <div className="pt-3 border-t border-black/10">
                <div className="dsc-label text-black/40 mb-2">
                  Weekly hours
                </div>
                {av.length === 0 ? (
                  <div className="text-sm text-black/40 italic">
                    Not set — defaults to 6am–9pm any day
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {DAY_NAMES.map((name, dayIdx) => {
                      const rows = byDay.get(dayIdx) ?? []
                      return (
                        <div key={dayIdx} className="text-xs">
                          <div className="dsc-label text-black/50 mb-1">
                            {name}
                          </div>
                          {rows.length === 0 ? (
                            <div className="text-black/20">·</div>
                          ) : (
                            rows.map((r, i) => (
                              <div key={i} className="font-mono text-[10px] text-black leading-tight">
                                {fmtMinute(r.startMinute)}
                                <br />
                                <span className="text-black/40">–</span>
                                <br />
                                {fmtMinute(r.endMinute)}
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {t.todayStats.total > 0 && (
                <div className="pt-3 mt-3 border-t border-black/10 flex items-center gap-3 text-xs">
                  <span className="dsc-label text-black/40">Today</span>
                  <span className="text-black/70">
                    {t.todayStats.completed}/{t.todayStats.total} done
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
