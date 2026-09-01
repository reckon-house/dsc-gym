'use client'

// Named, recurring cohorts — "the basketball group, Mondays at 11".
//
// A group is a roster plus an optional standing time. Creating one doesn't put
// anything on the calendar: Materialize does that, week by week, and it's
// deliberately a separate act so a roster edit can never silently rewrite
// sessions people have already been told about.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'

interface Member {
  athleteId: string
  athlete: { id: string; firstName: string; lastName: string; archived: boolean }
}

interface Coach {
  trainerId: string
  isLead: boolean
  trainer: { id: string; user: { name: string } }
}

interface Group {
  id: string
  name: string
  dayOfWeek: number | null
  startMinute: number | null
  duration: number
  active: boolean
  notes: string | null
  openForSignup: boolean
  capacity: number | null
  description: string | null
  members: Member[]
  coaches: Coach[]
  _count: { sessions: number }
}

interface TrainerOpt {
  id: string
  user: { name: string }
}

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtMinute(m: number): string {
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm}${ampm}`
}

/** "11:00" -> 660. Returns null on anything the time input wouldn't produce. */
function parseTimeInput(v: string): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  return mins >= 0 && mins <= 1439 ? mins : null
}

function toTimeInput(m: number | null): string {
  if (m === null) return ''
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function scheduleLine(g: Group): string {
  if (g.dayOfWeek === null || g.startMinute === null) return 'No standing time'
  return `${DAYS[g.dayOfWeek]}s at ${fmtMinute(g.startMinute)} · ${g.duration} min`
}

export default function GroupsPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [trainers, setTrainers] = useState<TrainerOpt[]>([])
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/groups?includeInactive=${showInactive}`)
    const data = await res.json()
    setLoading(false)
    if (data.success) setGroups(data.data)
  }, [showInactive])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
    fetch('/api/trainers')
      .then((r) => r.json())
      .then((d) => d.success && setTrainers(d.data))
    fetch('/api/athletes')
      .then((r) => r.json())
      .then((d) => d.success && setAthletes(d.data))
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  async function materialize(group: Group) {
    setBanner(null)
    const res = await fetch(`/api/admin/groups/${group.id}/materialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeks: 8 }),
    })
    const data = await res.json()
    if (!data.success) {
      setBanner(data.error ?? 'Could not put those sessions on the calendar.')
      return
    }
    // Both come back as arrays; skipped entries carry the reason, which is the
    // only useful thing to say when nothing was created.
    const created: unknown[] = data.data?.created ?? []
    const skipped: { date: string; reason: string }[] = data.data?.skipped ?? []
    if (created.length === 0) {
      const reason = skipped[0]?.reason
      setBanner(
        `${group.name}: nothing added${reason ? ` — ${reason.toLowerCase().replace(/\.$/, '')}` : ''}.`
      )
    } else {
      setBanner(
        `${group.name}: ${created.length} ${created.length === 1 ? 'session' : 'sessions'} added${
          skipped.length ? `, ${skipped.length} skipped` : ''
        }. Everyone on the roster has been emailed once.`
      )
    }
    load()
  }

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Groups" />
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        <button
          onClick={() => setCreating(true)}
          className="w-full mb-4 h-12 bg-black text-white rounded-full dsc-headline text-base"
        >
          + New group
        </button>

        {banner && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 mb-4 flex items-start justify-between gap-3">
            <span>{banner}</span>
            <button
              onClick={() => setBanner(null)}
              className="shrink-0 opacity-50 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-black"
          />
          <span className="dsc-label text-black/50">Show retired groups</span>
        </label>

        {loading ? (
          <div className="dsc-label text-black/40 text-center py-8">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center">
            <div className="dsc-label text-black/40 mb-1">No groups yet</div>
            <p className="text-sm text-black/60">
              A group is a roster with a standing time. Make one, then hit
              Materialize to put it on the calendar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const active = g.members.filter((m) => !m.athlete.archived)
              const lead = g.coaches.find((c) => c.isLead)
              return (
                <div
                  key={g.id}
                  className={`rounded-3xl p-5 ${
                    g.active ? 'bg-black/[0.04]' : 'bg-black/[0.02] opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="dsc-headline text-xl text-black truncate">
                        {g.name}
                        {!g.active && (
                          <span className="ml-2 dsc-label text-black/40">Retired</span>
                        )}
                      </div>
                      <div className="dsc-label text-black/50 mt-1">{scheduleLine(g)}</div>
                      {g.openForSignup && (
                        <div className="dsc-label text-emerald-700 mt-1">
                          Open to families
                          {g.capacity !== null
                            ? ` · ${active.length}/${g.capacity} spots`
                            : ` · ${active.length} enrolled`}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditing(g)}
                      className="dsc-label text-black/50 hover:text-black shrink-0"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {active.length === 0 ? (
                      <span className="dsc-label text-black/30">
                        {g.openForSignup
                          ? 'Empty — showing on family schedules, waiting for signups'
                          : 'Nobody on the roster'}
                      </span>
                    ) : (
                      active.map((m) => (
                        <span
                          key={m.athleteId}
                          className="px-2.5 py-1 rounded-full bg-black text-white text-xs font-medium"
                        >
                          {m.athlete.firstName} {m.athlete.lastName[0]}.
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="dsc-label text-black/50">
                      {g.coaches.length === 0
                        ? 'No coach assigned'
                        : g.coaches
                            .map(
                              (c) =>
                                `${c.trainer.user.name}${
                                  c.isLead && g.coaches.length > 1 ? ' (lead)' : ''
                                }`
                            )
                            .join(' · ')}
                    </div>
                    {(() => {
                      // A title on an enabled button overrides its visible
                      // label for screen readers, so it's only set when the
                      // button is disabled — where explaining why is the
                      // whole point.
                      const blocked =
                        g.dayOfWeek === null || g.startMinute === null
                          ? 'Give the group a standing day and time first'
                          : !lead
                            ? 'Assign a coach first'
                            : active.length === 0
                              ? 'Add at least one athlete first'
                              : !g.active
                                ? 'This group is retired'
                                : null
                      return (
                        <button
                          onClick={() => materialize(g)}
                          disabled={blocked !== null}
                          title={blocked ?? undefined}
                          className="h-9 px-4 rounded-full bg-black text-white text-sm font-semibold disabled:bg-black/20"
                        >
                          Materialize 8 weeks
                        </button>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <GroupSheet
          group={editing}
          trainers={trainers}
          athletes={athletes}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function GroupSheet({
  group,
  trainers,
  athletes,
  onClose,
  onSaved,
}: {
  group: Group | null
  trainers: TrainerOpt[]
  athletes: AthleteOpt[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = Boolean(group)
  const [name, setName] = useState(group?.name ?? '')
  const [dayOfWeek, setDayOfWeek] = useState<string>(
    group?.dayOfWeek === null || group?.dayOfWeek === undefined ? '' : String(group.dayOfWeek)
  )
  const [time, setTime] = useState(toTimeInput(group?.startMinute ?? null))
  const [duration, setDuration] = useState(group?.duration ?? 60)
  const [memberIds, setMemberIds] = useState<string[]>(
    group?.members.map((m) => m.athleteId) ?? []
  )
  const [coachIds, setCoachIds] = useState<string[]>(group?.coaches.map((c) => c.trainerId) ?? [])
  const [openForSignup, setOpenForSignup] = useState(group?.openForSignup ?? false)
  const [capacity, setCapacity] = useState(
    group?.capacity === null || group?.capacity === undefined ? '' : String(group.capacity)
  )
  const [description, setDescription] = useState(group?.description ?? '')
  const [leadId, setLeadId] = useState<string>(
    group?.coaches.find((c) => c.isLead)?.trainerId ?? ''
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Snapshot of who was on the roster when the sheet opened, so the PATCH can
  // send add/remove lists rather than a wholesale replacement.
  const originalMembers = useMemo(() => group?.members.map((m) => m.athleteId) ?? [], [group])
  const originalCoaches = useMemo(() => group?.coaches.map((c) => c.trainerId) ?? [], [group])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const sorted = [...athletes].sort((a, b) => a.lastName.localeCompare(b.lastName))
    if (!q) return sorted
    return sorted.filter((a) =>
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(q)
    )
  }, [athletes, search])

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError('Give the group a name.')
      return
    }
    const startMinute = time ? parseTimeInput(time) : null
    if (time && startMinute === null) {
      setError('That time is not valid.')
      return
    }
    if ((dayOfWeek === '') !== (startMinute === null)) {
      setError('A standing time needs both a day and a time — or neither.')
      return
    }
    // The lead coach becomes Session.trainerId, so it can't be someone who
    // isn't on the group.
    const lead = coachIds.includes(leadId) ? leadId : coachIds[0]

    setSaving(true)
    try {
      if (!isEditing) {
        const res = await fetch('/api/admin/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            dayOfWeek: dayOfWeek === '' ? null : Number(dayOfWeek),
            startMinute,
            duration,
            memberIds,
            // First in the list is the lead, per the POST route.
            coachIds: lead ? [lead, ...coachIds.filter((c) => c !== lead)] : coachIds,
            openForSignup,
            capacity: capacity.trim() === '' ? null : Number(capacity),
            description: description.trim() || null,
          }),
        })
        const data = await res.json()
        if (!data.success) {
          setError(data.error ?? 'Could not create the group.')
          return
        }
      } else {
        const res = await fetch(`/api/admin/groups/${group!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            dayOfWeek: dayOfWeek === '' ? null : Number(dayOfWeek),
            startMinute,
            duration,
            addMemberIds: memberIds.filter((id) => !originalMembers.includes(id)),
            removeMemberIds: originalMembers.filter((id) => !memberIds.includes(id)),
            addCoachIds: coachIds.filter((id) => !originalCoaches.includes(id)),
            removeCoachIds: originalCoaches.filter((id) => !coachIds.includes(id)),
            setLeadCoachId: lead || undefined,
            openForSignup,
            capacity: capacity.trim() === '' ? null : Number(capacity),
            description: description.trim() || null,
          }),
        })
        const data = await res.json()
        if (!data.success) {
          setError(data.error ?? 'Could not save the group.')
          return
        }
      }
      onSaved()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function retire() {
    if (!group) return
    setSaving(true)
    const res = await fetch(`/api/admin/groups/${group.id}`, { method: 'DELETE' })
    const data = await res.json()
    setSaving(false)
    if (!data.success) {
      setError(data.error ?? 'Could not retire the group.')
      return
    }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-lg max-h-[88vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="dsc-label text-black/40">Group</div>
            <div className="dsc-headline text-2xl text-black">
              {isEditing ? 'Edit' : 'New group'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Basketball group"
              className="w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
              >
                <option value="">No standing day</option>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
              />
            </Field>
          </div>

          <Field label="Duration">
            <div className="grid grid-cols-4 gap-2">
              {[30, 45, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`h-11 rounded-xl text-sm font-medium ${
                    duration === d
                      ? 'bg-black text-white'
                      : 'bg-black/5 text-black hover:bg-black/[0.08]'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-2xl bg-black/[0.04] p-3 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={openForSignup}
                onChange={(e) => setOpenForSignup(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-black shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-black">
                  Show this class to families
                </span>
                <span className="block text-xs text-black/50 mt-0.5">
                  It appears on their schedule even with an empty roster, and they
                  can ask for a spot. You approve every request.
                </span>
              </span>
            </label>

            {openForSignup && (
              <>
                <label className="block">
                  <div className="dsc-label text-black/50 mb-1">Spots (optional)</div>
                  <input
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    inputMode="numeric"
                    placeholder="No limit"
                    className="w-full h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
                  />
                </label>
                <label className="block">
                  <div className="dsc-label text-black/50 mb-1">Who it&rsquo;s for</div>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Middle-school guards working on handles"
                    className="w-full h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
                  />
                </label>
              </>
            )}
          </div>

          <Field label={`Coaches${coachIds.length > 1 ? ' — tap a name again to make them lead' : ''}`}>
            <div className="flex flex-wrap gap-1.5">
              {trainers.map((t) => {
                const on = coachIds.includes(t.id)
                const isLead = on && (coachIds.includes(leadId) ? leadId : coachIds[0]) === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (on) {
                        // Second tap promotes to lead; third removes.
                        if (!isLead) setLeadId(t.id)
                        else toggle(coachIds, setCoachIds, t.id)
                      } else {
                        setCoachIds([...coachIds, t.id])
                        if (!leadId) setLeadId(t.id)
                      }
                    }}
                    className={`px-3 h-9 rounded-full text-sm font-medium ${
                      isLead
                        ? 'bg-black text-white ring-2 ring-offset-1 ring-black'
                        : on
                          ? 'bg-black/70 text-white'
                          : 'bg-black/5 text-black hover:bg-black/[0.08]'
                    }`}
                  >
                    {t.user.name}
                    {isLead && coachIds.length > 1 ? ' ★' : ''}
                  </button>
                )
              })}
            </div>
            <div className="text-xs text-black/40 mt-1.5">
              The lead coach owns the session; the others are assisting and get
              blocked from being double-booked at that hour.
            </div>
          </Field>

          <Field label={`Roster — ${memberIds.length} selected`}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athletes"
              className="w-full h-11 px-3 mb-2 bg-black/5 rounded-xl text-black placeholder:text-black/30"
            />
            <div className="max-h-56 overflow-y-auto rounded-xl border border-black/10 divide-y divide-black/5">
              {filtered.map((a) => {
                const on = memberIds.includes(a.id)
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-black/[0.03]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(memberIds, setMemberIds, a.id)}
                      className="w-4 h-4 accent-black"
                    />
                    <span className="text-sm text-black">
                      {a.firstName} {a.lastName}
                    </span>
                  </label>
                )
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-sm text-black/40">No match.</div>
              )}
            </div>
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && group!.active && (
              <button
                onClick={retire}
                disabled={saving}
                className="flex-1 h-12 rounded-full border border-red-300 text-red-700 font-semibold disabled:opacity-50"
              >
                Retire
              </button>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create'}
            </button>
          </div>
          {isEditing && group!.active && (
            <p className="text-xs text-black/40">
              Retiring keeps sessions already on the calendar — it only stops the
              group from being materialized again.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="dsc-label text-black/50 mb-1">{label}</div>
      {children}
    </label>
  )
}
