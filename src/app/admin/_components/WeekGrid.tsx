'use client'

import { useEffect, useMemo } from 'react'

export interface GridSession {
  id: string
  trainerId?: string
  athleteId?: string
  trainerName: string
  athleteName: string
  scheduledAt: string
  duration: number
  cancelled?: boolean
  completed?: boolean
  attendees?: { id: string; firstName: string; lastName: string }[]
}

export interface GridProposal {
  id: string
  action: 'create' | 'move' | 'cancel'
  trainerName: string | null
  athleteName: string | null
  scheduledAt: string | null
  duration: number
  conflictReason?: string | null
}

interface Props {
  weekStart: Date
  sessions: GridSession[]
  proposals: GridProposal[]
  onWeekChange: (start: Date) => void
  onSessionTap?: (session: GridSession) => void
  onAddTap?: (date: Date) => void
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function shiftWeek(d: Date, weeks: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + weeks * 7)
  return out
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')
}

export function WeekGrid({
  weekStart,
  sessions,
  proposals,
  onWeekChange,
  onSessionTap,
  onAddTap,
}: Props) {
  useEffect(() => {
    const aligned = startOfWeek(weekStart)
    if (aligned.getTime() !== weekStart.getTime()) onWeekChange(aligned)
  }, [weekStart, onWeekChange])

  const days = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      out.push(d)
    }
    return out
  }, [weekStart])

  const sessionsByDay = useMemo(() => {
    const map: Record<string, GridSession[]> = {}
    for (const s of sessions) {
      const key = new Date(s.scheduledAt).toDateString()
      ;(map[key] ??= []).push(s)
    }
    for (const k of Object.keys(map)) {
      map[k].sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    }
    return map
  }, [sessions])

  const proposalsByDay = useMemo(() => {
    const map: Record<string, GridProposal[]> = {}
    for (const p of proposals) {
      if (!p.scheduledAt) continue
      const key = new Date(p.scheduledAt).toDateString()
      ;(map[key] ??= []).push(p)
    }
    return map
  }, [proposals])

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const todayKey = new Date().toDateString()
  const pendingCount = proposals.length

  return (
    <div className="bg-white">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
        <button
          onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
          className="w-8 h-8 flex items-center justify-center text-black/60 hover:text-black"
          aria-label="Previous week"
        >
          ←
        </button>
        <div className="flex items-baseline gap-2">
          <span className="dsc-label text-black/40">Week of</span>
          <span className="text-sm md:text-base font-bold tracking-tight text-black">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
            {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onWeekChange(startOfWeek(new Date()))}
            className="dsc-label text-black/60 hover:text-black px-2 py-1"
          >
            Today
          </button>
          <button
            onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
            className="w-8 h-8 flex items-center justify-center text-black/60 hover:text-black"
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>

      {/* Day rows */}
      <div>
        {days.map((d) => {
          const key = d.toDateString()
          const daySessions = sessionsByDay[key] ?? []
          const dayProposals = proposalsByDay[key] ?? []
          const isToday = key === todayKey
          const isEmpty = daySessions.length === 0 && dayProposals.length === 0

          return (
            <div
              key={key}
              className={`border-b border-black/10 ${
                isToday ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              <div className="grid grid-cols-[80px_1fr_auto] md:grid-cols-[120px_1fr_auto] items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <span
                    className={`dsc-label ${isToday ? 'text-white/60' : 'text-black/50'}`}
                  >
                    {DAY_NAMES[d.getDay()]}
                  </span>
                  <span className="text-3xl md:text-4xl font-extrabold tracking-tight leading-none">
                    {d.getDate()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {isEmpty && (
                    <span
                      className={`text-xs italic ${isToday ? 'text-white/40' : 'text-black/30'}`}
                    >
                      —
                    </span>
                  )}
                  {daySessions.map((s) => (
                    <SessionPill
                      key={s.id}
                      session={s}
                      inverted={isToday}
                      onTap={onSessionTap ? () => onSessionTap(s) : undefined}
                    />
                  ))}
                  {dayProposals.map((p) => (
                    <ProposalPill key={p.id} proposal={p} inverted={isToday} />
                  ))}
                  {onAddTap && (
                    <button
                      onClick={() => onAddTap(d)}
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm leading-none ${
                        isToday
                          ? 'bg-white/15 text-white hover:bg-white/25'
                          : 'bg-black/5 text-black/60 hover:bg-black/10'
                      }`}
                      aria-label={`Add session on ${d.toDateString()}`}
                    >
                      +
                    </button>
                  )}
                </div>

                <div
                  className={`dsc-label ${
                    isToday ? 'text-white/60' : 'text-black/40'
                  }`}
                >
                  {daySessions.length + dayProposals.length || ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer status */}
      {pendingCount > 0 && (
        <div className="px-4 py-2 border-b border-black/10 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="dsc-label text-black/60">
            {pendingCount} pending · waiting on you to confirm
          </span>
        </div>
      )}
    </div>
  )
}

function SessionPill({
  session,
  inverted,
  onTap,
}: {
  session: GridSession
  inverted: boolean
  onTap?: () => void
}) {
  const time = fmtTime(session.scheduledAt)
  const baseColors = session.cancelled
    ? inverted
      ? 'bg-white/10 text-white/40 line-through'
      : 'bg-black/5 text-black/40 line-through'
    : session.completed
      ? inverted
        ? 'bg-emerald-400/20 text-emerald-200'
        : 'bg-emerald-100 text-emerald-900'
      : inverted
        ? 'bg-white text-black'
        : 'bg-black text-white'

  const interactive = onTap ? 'cursor-pointer hover:opacity-80 active:opacity-60' : ''
  const Tag: 'button' | 'span' = onTap ? 'button' : 'span'

  const attendees = session.attendees ?? []
  const isGroup = attendees.length > 1
  const display = isGroup
    ? `${attendees[0].firstName} +${attendees.length - 1}`
    : session.athleteName

  return (
    <Tag
      onClick={onTap}
      className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded text-xs leading-tight ${baseColors} ${interactive}`}
      title={
        isGroup
          ? attendees.map((a) => `${a.firstName} ${a.lastName}`).join(', ')
          : undefined
      }
    >
      <span className="font-mono text-[10px] opacity-80">{time}</span>
      <span className="font-medium truncate max-w-[140px]">{display}</span>
      <span className="opacity-60 text-[10px] truncate max-w-[80px] hidden sm:inline">
        · {session.trainerName.split(' ')[0]}
      </span>
    </Tag>
  )
}

function ProposalPill({
  proposal,
  inverted,
}: {
  proposal: GridProposal
  inverted: boolean
}) {
  const time = proposal.scheduledAt ? fmtTime(proposal.scheduledAt) : '?'
  const isConflict = !!proposal.conflictReason
  const isCancel = proposal.action === 'cancel'

  let classes: string
  if (isConflict) {
    classes = inverted
      ? 'border border-dashed border-red-300 text-red-200 bg-red-500/10'
      : 'border border-dashed border-red-500 text-red-700 bg-red-50'
  } else if (isCancel) {
    classes = inverted
      ? 'border border-dashed border-orange-300 text-orange-200 bg-orange-500/10 line-through'
      : 'border border-dashed border-orange-500 text-orange-800 bg-orange-50 line-through'
  } else {
    classes = inverted
      ? 'border border-dashed border-blue-300 text-blue-200 bg-blue-500/10'
      : 'border border-dashed border-blue-500 text-blue-800 bg-blue-50'
  }

  return (
    <span
      className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded text-xs leading-tight ${classes}`}
      title={proposal.conflictReason ?? ''}
    >
      <span className="font-mono text-[10px] opacity-80">{time}</span>
      <span className="font-medium truncate max-w-[140px]">
        {proposal.athleteName ?? proposal.action}
      </span>
      {proposal.trainerName && (
        <span className="opacity-60 text-[10px] truncate max-w-[80px] hidden sm:inline">
          · {proposal.trainerName.split(' ')[0]}
        </span>
      )}
    </span>
  )
}

export { startOfWeek }
