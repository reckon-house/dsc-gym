'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  SessionEditSheet,
  type SessionDraft,
} from '../../_components/SessionEditSheet'
import { MeetingSheet, type MeetingDraft } from '../../_components/MeetingSheet'
import { RecoverySheet, type RecoveryDraft } from '../../_components/RecoverySheet'

interface DaySession {
  id: string
  trainerId: string
  athleteId: string
  scheduledAt: string
  duration: number
  cancelled: boolean
  completed: boolean
  athlete: { firstName: string; lastName: string } | null
  groupName?: string | null
  trainer: { id: string; user: { name: string } }
  attendees?: { id: string; firstName: string; lastName: string }[]
}

interface DayMeeting {
  id: string
  title: string
  startsAt: string
  duration: number
  trainerIds: string[]
}

interface DayRecovery {
  id: string
  at: string
  priceCents: number
  note: string | null
  athlete: { id: string; firstName: string; lastName: string }
}

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

/** Everything that happened on the floor that day, on one clock. */
type TimelineItem =
  | { kind: 'session'; at: number; session: DaySession }
  | { kind: 'meeting'; at: number; meeting: DayMeeting }
  | { kind: 'recovery'; at: number; visit: DayRecovery }

function fmtTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')
}

function parseDateKey(key: string): Date | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CalendarDayDetail() {
  const router = useRouter()
  const params = useParams<{ date: string }>()
  const searchParams = useSearchParams()
  // Carried over from the week view's trainer filter, so drilling into a day
  // doesn't silently widen the view back to everyone.
  const filterTrainerId = searchParams.get('trainerId') ?? ''
  // Memoized on the URL string, not recomputed per render. parseDateKey mints
  // a new Date object every call, and an unstable `date` invalidates every
  // memo and callback below it — which sends the load effects into a fetch
  // loop that only stops when the browser runs out of sockets.
  const date = useMemo(() => parseDateKey(params.date), [params.date])
  const [sessions, setSessions] = useState<DaySession[]>([])
  const [meetings, setMeetings] = useState<DayMeeting[]>([])
  const [recovery, setRecovery] = useState<DayRecovery[]>([])
  const [defaultPriceCents, setDefaultPriceCents] = useState(2500)
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft | null>(null)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(null)

  // The day's local bounds, shared by all three fetches.
  const bounds = useMemo(() => {
    if (!date) return null
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }, [date])

  const loadSessions = useCallback(async () => {
    if (!bounds) return
    const qs = new URLSearchParams({
      startDate: bounds.start.toISOString(),
      endDate: bounds.end.toISOString(),
    })
    if (filterTrainerId) qs.set('trainerId', filterTrainerId)
    const res = await fetch(`/api/sessions?${qs.toString()}`)
    const data = await res.json()
    if (!data.success) return
    setSessions(data.data)
    // Re-point the open sheet at the row we just refetched. `draft` was a
    // snapshot taken when the session was tapped, so without this an edit
    // updated the list underneath while the sheet kept showing the roster as
    // it was on open — reopening it appeared to lose the change.
    setDraft((prev) => {
      if (!prev?.id) return prev
      const fresh = (data.data as DaySession[]).find((x) => x.id === prev.id)
      if (!fresh) return prev
      return {
        id: fresh.id,
        trainerId: fresh.trainerId,
        athleteId: fresh.athleteId,
        scheduledAt: fresh.scheduledAt,
        duration: fresh.duration,
        attendees: fresh.attendees,
      }
    })
  }, [bounds, filterTrainerId])

  const loadMeetings = useCallback(async () => {
    if (!bounds) return
    const res = await fetch(
      `/api/admin/calendar-events?startDate=${bounds.start.toISOString()}&endDate=${bounds.end.toISOString()}`
    )
    const data = await res.json()
    if (!data.success) return
    const all: DayMeeting[] = data.data
    // An all-staff meeting has no trainerIds and blocks everyone, so it stays
    // visible however the filter is narrowed.
    setMeetings(
      filterTrainerId
        ? all.filter((m) => m.trainerIds.length === 0 || m.trainerIds.includes(filterTrainerId))
        : all
    )
  }, [bounds, filterTrainerId])

  const loadRecovery = useCallback(async () => {
    if (!bounds) return
    const res = await fetch(
      `/api/admin/recovery?from=${bounds.start.toISOString()}&to=${bounds.end.toISOString()}`
    )
    const data = await res.json()
    if (!data.success) return
    setRecovery(data.data.visits)
    setDefaultPriceCents(data.data.defaultPriceCents ?? 2500)
  }, [bounds])

  const loadOptions = useCallback(async () => {
    const [t, a] = await Promise.all([
      fetch('/api/trainers').then((r) => r.json()),
      fetch('/api/athletes').then((r) => r.json()),
    ])
    if (t.success) setTrainers(t.data)
    if (a.success) {
      setAthletes(
        a.data.map(
          (row: {
            id: string
            firstName: string
            lastName: string
            trainerId: string | null
          }) => ({
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            trainerId: row.trainerId,
          })
        )
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
    loadSessions()
    loadMeetings()
    loadRecovery()
    loadOptions()
  }, [loadSessions, loadMeetings, loadRecovery, loadOptions])

  const prevDay = useMemo(() => {
    if (!date) return null
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    return d
  }, [date])

  const nextDay = useMemo(() => {
    if (!date) return null
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    return d
  }, [date])

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...sessions.map(
        (s): TimelineItem => ({
          kind: 'session',
          at: new Date(s.scheduledAt).getTime(),
          session: s,
        })
      ),
      ...meetings.map(
        (m): TimelineItem => ({
          kind: 'meeting',
          at: new Date(m.startsAt).getTime(),
          meeting: m,
        })
      ),
      ...recovery.map(
        (v): TimelineItem => ({ kind: 'recovery', at: new Date(v.at).getTime(), visit: v })
      ),
    ]
    return items.sort((a, b) => a.at - b.at)
  }, [sessions, meetings, recovery])

  function handleTap(session: DaySession) {
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

  /** New items land at 9am on the day being viewed, not "now". */
  function defaultTime(hour: number): string {
    if (!date) return new Date().toISOString()
    const at = new Date(date)
    at.setHours(hour, 0, 0, 0)
    return at.toISOString()
  }

  function handleAdd() {
    setDraft({ scheduledAt: defaultTime(9), duration: 60 })
    setSheetOpen(true)
  }

  function handleAddMeeting() {
    setMeetingDraft({ startsAt: defaultTime(9), duration: 60, trainerIds: [] })
    setMeetingOpen(true)
  }

  function handleAddRecovery() {
    setRecoveryDraft({ at: defaultTime(12) })
    setRecoveryOpen(true)
  }

  if (!date) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="dsc-label text-black/40 mb-2">Bad date</div>
          <h2 className="dsc-headline text-2xl text-black mb-4">
            Couldn&rsquo;t parse that day
          </h2>
          <Link
            href="/admin/calendar"
            className="inline-block px-5 py-2 bg-black text-white rounded-full font-semibold"
          >
            Back to calendar
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href="/admin/calendar"
          aria-label="Back to calendar"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <Link href="/admin" aria-label="DSC home" className="block">
          <Image src="/logo-mark.png" alt="DSC" width={28} height={28} priority />
        </Link>
        <div className="ml-2 dsc-headline text-lg text-black truncate">
          {date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        {/* Date hero */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="dsc-label text-black/40 mb-1">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="dsc-headline text-5xl md:text-6xl text-black leading-none">
              {date.toLocaleDateString('en-US', { month: 'short' })}{' '}
              {date.getDate()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {prevDay && (
              <Link
                href={`/admin/calendar/${dateKey(prevDay)}${filterTrainerId ? `?trainerId=${filterTrainerId}` : ''}`}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
                aria-label="Previous day"
              >
                ←
              </Link>
            )}
            {nextDay && (
              <Link
                href={`/admin/calendar/${dateKey(nextDay)}${filterTrainerId ? `?trainerId=${filterTrainerId}` : ''}`}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/5 text-black/70 hover:bg-black/10"
                aria-label="Next day"
              >
                →
              </Link>
            )}
          </div>
        </div>

        {/* Add row. Sessions are the everyday act, so they get the solid
            button; meetings and recovery sit alongside as secondary. */}
        <button
          onClick={handleAdd}
          className="w-full mb-2 h-12 bg-black text-white rounded-full dsc-headline text-base"
        >
          + Add session
        </button>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={handleAddMeeting}
            className="h-11 rounded-full border border-black/20 text-black/70 hover:bg-black/[0.04] font-semibold text-sm"
          >
            + Meeting
          </button>
          <button
            onClick={handleAddRecovery}
            className="h-11 rounded-full border border-black/20 text-black/70 hover:bg-black/[0.04] font-semibold text-sm"
          >
            + Recovery
          </button>
        </div>

        {/* The day */}
        {timeline.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">Empty day</div>
            <p className="text-sm text-black/60">
              Nothing on the books. Tap{' '}
              <span className="font-semibold text-black">Add session</span> to
              schedule something.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((item) => {
              if (item.kind === 'meeting') {
                const m = item.meeting
                const who =
                  m.trainerIds.length === 0
                    ? 'All staff'
                    : m.trainerIds
                        .map((id) => trainers.find((t) => t.id === id)?.user.name.split(' ')[0])
                        .filter(Boolean)
                        .join(', ')
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMeetingDraft({
                        id: m.id,
                        title: m.title,
                        startsAt: m.startsAt,
                        duration: m.duration,
                        trainerIds: m.trainerIds,
                      })
                      setMeetingOpen(true)
                    }}
                    className="w-full rounded-3xl p-5 flex items-center justify-between gap-4 border border-dashed border-black/25 text-black hover:bg-black/[0.03]"
                  >
                    <div className="flex items-baseline gap-4 min-w-0 text-left">
                      <div className="font-mono text-sm text-black/50 shrink-0 w-16">
                        {fmtTime(m.startsAt)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{m.title}</div>
                        <div className="dsc-label text-black/40 mt-0.5">
                          Meeting · {who} · {m.duration} min
                        </div>
                      </div>
                    </div>
                    <span className="dsc-label text-black/40 shrink-0">Edit</span>
                  </button>
                )
              }

              if (item.kind === 'recovery') {
                const v = item.visit
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setRecoveryDraft({
                        id: v.id,
                        athleteId: v.athlete.id,
                        at: v.at,
                        priceCents: v.priceCents,
                        note: v.note,
                      })
                      setRecoveryOpen(true)
                    }}
                    className="w-full rounded-3xl p-5 flex items-center justify-between gap-4 bg-sky-50 text-sky-950 hover:bg-sky-100"
                  >
                    <div className="flex items-baseline gap-4 min-w-0 text-left">
                      <div className="font-mono text-sm opacity-60 shrink-0 w-16">
                        {fmtTime(v.at)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {v.athlete.firstName} {v.athlete.lastName}
                        </div>
                        <div className="dsc-label opacity-60 mt-0.5">
                          Recovery room{v.note ? ` · ${v.note}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-sm shrink-0">
                      ${(v.priceCents / 100).toFixed(2)}
                    </span>
                  </button>
                )
              }

              const s = item.session
              // An open class has nobody in it yet, so there is no name to
              // show — say that rather than rendering a blank row.
              const roster = s.attendees ?? []
              const displayName =
                roster.length > 1
                  ? `${roster[0].firstName} +${roster.length - 1}`
                  : roster.length === 1
                    ? `${roster[0].firstName} ${roster[0].lastName}`
                    : s.athlete
                      ? `${s.athlete.firstName} ${s.athlete.lastName}`
                      : s.groupName
                        ? `${s.groupName} — open`
                        : 'Open class — no one yet'
              return (
                <button
                  key={s.id}
                  onClick={s.cancelled ? undefined : () => handleTap(s)}
                  disabled={s.cancelled}
                  className={`w-full rounded-3xl p-5 flex items-center justify-between gap-4 ${
                    s.cancelled
                      ? 'bg-black/[0.04] text-black/40 line-through'
                      : s.completed
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-black text-white hover:bg-black/90 active:opacity-80'
                  }`}
                >
                  <div className="flex items-baseline gap-4 min-w-0 text-left">
                    <div className="font-mono text-sm opacity-75 shrink-0 w-16">
                      {fmtTime(s.scheduledAt)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{displayName}</div>
                      <div className="dsc-label opacity-60 mt-0.5">
                        {s.trainer.user.name} · {s.duration} min
                      </div>
                    </div>
                  </div>
                  {!s.cancelled && (
                    <span className="dsc-label opacity-50 shrink-0">Edit</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <SessionEditSheet
        open={sheetOpen}
        initial={draft}
        trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
        athletes={athletes}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          loadSessions()
        }}
      />

      <MeetingSheet
        open={meetingOpen}
        initial={meetingDraft}
        trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
        onClose={() => setMeetingOpen(false)}
        onSaved={() => {
          loadMeetings()
        }}
      />

      <RecoverySheet
        open={recoveryOpen}
        initial={recoveryDraft}
        athletes={athletes}
        defaultPriceCents={defaultPriceCents}
        onClose={() => setRecoveryOpen(false)}
        onSaved={() => {
          loadRecovery()
        }}
      />
    </div>
  )
}
