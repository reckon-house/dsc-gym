'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'

interface AthleteRow {
  id: string
  firstName: string
  lastName: string
  email: string
  trainer: {
    id: string
    user: { name: string }
  } | null
}

interface TrainerOpt {
  id: string
  user: { name: string }
}

export default function AthletesView() {
  const router = useRouter()
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [q, setQ] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  async function load() {
    const [a, t] = await Promise.all([
      fetch('/api/athletes').then((r) => r.json()),
      fetch('/api/trainers').then((r) => r.json()),
    ])
    if (a.success) setAthletes(a.data)
    if (t.success) setTrainers(t.data)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (!q.trim()) return athletes
    const needle = q.toLowerCase()
    return athletes.filter(
      (a) =>
        a.firstName.toLowerCase().includes(needle) ||
        a.lastName.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle)
    )
  }, [athletes, q])

  async function assign(athleteId: string, trainerId: string) {
    setAssigning(athleteId)
    await fetch(`/api/athletes/${athleteId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainerId }),
    })
    await load()
    setAssigning(null)
  }

  const unassignedCount = athletes.filter((a) => !a.trainer).length

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Athletes" />

      <div className="px-4 py-4 max-w-3xl mx-auto">
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="flex-1 px-4 h-11 bg-black/5 rounded-full text-[15px] text-black placeholder:text-black/40 focus:outline-none focus:bg-black/[0.07]"
          />
          <div className="dsc-label text-black/50 shrink-0">
            {athletes.length} total
          </div>
        </div>

        {unassignedCount > 0 && (
          <div className="px-4 py-2 mb-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="dsc-label text-blue-900">
              {unassignedCount} athlete{unassignedCount === 1 ? '' : 's'} not assigned to a trainer
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-black/10 p-3 md:p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-black truncate">
                  {a.firstName} {a.lastName}
                </div>
                <div className="text-sm text-black/50 truncate">{a.email}</div>
              </div>
              <div className="shrink-0">
                {a.trainer ? (
                  <span className="dsc-label text-black/50">
                    with {a.trainer.user.name.split(' ')[0]}
                  </span>
                ) : (
                  <select
                    className="bg-white border border-black/20 text-black rounded-lg px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) =>
                      e.target.value && assign(a.id, e.target.value)
                    }
                    disabled={assigning === a.id}
                  >
                    <option value="" disabled>
                      Assign…
                    </option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.user.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-black/40 text-sm">
              No athletes match.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
