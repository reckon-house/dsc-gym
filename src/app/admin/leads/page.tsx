'use client'

// Leads and the waitlist. Built around one habit: every open lead has a next
// follow-up date, and "To do" is the list of the ones due. Logging a call and
// picking the next date is a single step in the lead sheet.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'
import { formatPhonePretty, smsHref, telHref } from '@/lib/phone'
import { useLocations } from '@/components/useLocations'

interface Note {
  id: string
  body: string
  byName: string | null
  createdAt: string
}

interface Lead {
  id: string
  firstName: string
  lastName: string | null
  parentName: string | null
  email: string | null
  phone: string | null
  birthdate: string | null
  interest: string | null
  source: string
  sourceDetail: string | null
  status: Status
  location: string | null
  groupId: string | null
  followUpOn: string | null
  lastContactedAt: string | null
  lostReason: string | null
  convertedAthleteId: string | null
  createdAt: string
  notes: Note[]
}

interface Summary {
  due: number
  overdue: number
  open: number
  noNextStep: number
  waitlist: number
}

type Status = 'new' | 'contacted' | 'trial' | 'waitlist' | 'converted' | 'lost'
type Tab = 'todo' | 'open' | 'waitlist' | 'converted' | 'lost'

const SOURCES: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'event', label: 'Event' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
]
const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]))

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  contacted: 'Contacted',
  trial: 'Trial',
  waitlist: 'Waitlist',
  converted: 'Member',
  lost: 'Lost',
}
const OPEN: Status[] = ['new', 'contacted', 'trial']

const TABS: { key: Tab; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'open', label: 'Open' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'converted', label: 'Members' },
  { key: 'lost', label: 'Lost' },
]

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}
function prettyDate(v: string): string {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fullName(l: Pick<Lead, 'firstName' | 'lastName'>): string {
  return [l.firstName, l.lastName].filter(Boolean).join(' ')
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [tab, setTab] = useState<Tab>('todo')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/leads')
    const d = await r.json().catch(() => null)
    if (d?.success) {
      setLeads(d.data)
      setSummary(d.summary)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
        else if (d.user.role !== 'ADMIN') router.replace('/trainer')
      })
    load()
    fetch('/api/admin/groups')
      .then((r) => r.json())
      .then((d) => d.success && setGroups(d.data.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))))
    fetch('/api/trainers')
      .then((r) => r.json())
      .then(
        (d) =>
          d.success &&
          setTrainers(d.data.map((t: { id: string; user: { name: string } }) => ({ id: t.id, name: t.user.name })))
      )
  }, [load, router])

  const today = ymd(new Date())
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return leads
      .filter((l) => {
        if (q) {
          const hay = `${fullName(l)} ${l.parentName ?? ''} ${l.email ?? ''} ${l.interest ?? ''}`.toLowerCase()
          if (!hay.includes(q) && !(digits.length >= 3 && (l.phone ?? '').includes(digits))) return false
          return true // searching looks across every tab
        }
        switch (tab) {
          case 'todo':
            return [...OPEN, 'waitlist'].includes(l.status) && (!l.followUpOn || l.followUpOn <= today)
          case 'open':
            return OPEN.includes(l.status)
          default:
            return l.status === tab
        }
      })
      .sort((a, b) => {
        // To do: overdue first, then due today, then leads with no next step.
        const ka = a.followUpOn ?? '9999'
        const kb = b.followUpOn ?? '9999'
        return ka === kb ? b.createdAt.localeCompare(a.createdAt) : ka.localeCompare(kb)
      })
  }, [leads, tab, search, today])

  const counts: Record<Tab, number> = useMemo(
    () => ({
      todo: leads.filter(
        (l) => [...OPEN, 'waitlist'].includes(l.status) && (!l.followUpOn || l.followUpOn <= today)
      ).length,
      open: leads.filter((l) => OPEN.includes(l.status)).length,
      waitlist: leads.filter((l) => l.status === 'waitlist').length,
      converted: leads.filter((l) => l.status === 'converted').length,
      lost: leads.filter((l) => l.status === 'lost').length,
    }),
    [leads, today]
  )

  const openLead = leads.find((l) => l.id === openId) ?? null
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Leads" />
      <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-4">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, parent, phone…"
            className="flex-1 min-w-0 h-11 px-4 bg-black/[0.04] rounded-full text-sm text-black"
          />
          <button
            onClick={() => setAdding(true)}
            className="h-11 px-5 bg-black text-white rounded-full text-sm font-semibold shrink-0"
          >
            + Add lead
          </button>
        </div>

        {summary && summary.overdue > 0 && !search && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-950">
            {summary.overdue} follow-up{summary.overdue === 1 ? ' is' : 's are'} overdue.
          </div>
        )}

        {!search && (
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`h-9 px-4 rounded-full text-sm font-semibold shrink-0 ${
                  tab === t.key ? 'bg-black text-white' : 'bg-black/5 text-black/70'
                }`}
              >
                {t.label}
                <span className="opacity-60 ml-1.5">{counts[t.key]}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="dsc-label text-black/40 py-8 text-center">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center text-sm text-black/60">
            {search
              ? 'Nobody matches that.'
              : tab === 'todo'
                ? 'Nothing due. Every open lead has a follow-up date in the future.'
                : 'Nobody here yet.'}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((l) => {
              const overdue = l.followUpOn !== null && l.followUpOn < today
              const dueToday = l.followUpOn === today
              const lastNote = l.notes[0]
              return (
                <button
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="w-full text-left rounded-3xl bg-black/[0.04] hover:bg-black/[0.07] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-black truncate">
                        {fullName(l)}
                        {l.parentName && <span className="font-normal text-black/50"> · {l.parentName}</span>}
                      </div>
                      <div className="text-sm text-black/60 truncate">
                        {l.interest ?? 'No interest noted'}
                        {l.status === 'waitlist' && groupName(l.groupId) ? ` · waiting on ${groupName(l.groupId)}` : ''}
                      </div>
                    </div>
                    <span className="dsc-label px-2 py-1 rounded-full bg-white text-black/70 shrink-0">
                      {STATUS_LABEL[l.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 dsc-label">
                    <span className="text-black/40">{SOURCE_LABEL[l.source] ?? l.source}</span>
                    {l.location && <span className="text-black/40">{l.location}</span>}
                    {[...OPEN, 'waitlist'].includes(l.status) &&
                      (l.followUpOn ? (
                        <span className={overdue ? 'text-red-700' : dueToday ? 'text-amber-800' : 'text-black/50'}>
                          {overdue ? 'Overdue · ' : dueToday ? 'Today · ' : 'Next · '}
                          {prettyDate(l.followUpOn)}
                        </span>
                      ) : (
                        <span className="text-amber-800">No follow-up set</span>
                      ))}
                  </div>
                  {lastNote && <div className="text-xs text-black/50 mt-1.5 truncate">“{lastNote.body}”</div>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {adding && (
        <LeadForm
          groups={groups}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false)
            load().then(() => setOpenId(id))
          }}
        />
      )}
      {openLead && (
        <LeadSheet
          lead={openLead}
          groups={groups}
          trainers={trainers}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return r.json().catch(() => ({ success: false, error: 'Could not reach the server.' }))
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="dsc-headline text-2xl text-black truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-6 space-y-4">{children}</div>
      </div>
    </div>
  )
}

const inputCls = 'w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30'

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="dsc-label text-black/50">{text}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-9 px-3 rounded-full text-sm font-semibold ${
            value === o.value ? 'bg-black text-white' : 'bg-black/5 text-black/70'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** New lead, or edit details of an existing one. */
function LeadForm({
  lead,
  groups,
  onClose,
  onSaved,
}: {
  lead?: Lead
  groups: { id: string; name: string }[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const locations = useLocations()
  const [f, setF] = useState({
    firstName: lead?.firstName ?? '',
    lastName: lead?.lastName ?? '',
    parentName: lead?.parentName ?? '',
    phone: lead?.phone ? formatPhonePretty(lead.phone) : '',
    email: lead?.email ?? '',
    birthdate: lead?.birthdate ?? '',
    interest: lead?.interest ?? '',
    source: lead?.source ?? 'instagram',
    sourceDetail: lead?.sourceDetail ?? '',
    location: lead?.location ?? '',
    groupId: lead?.groupId ?? '',
    followUpOn: lead ? (lead.followUpOn ?? '') : inDays(1),
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupes, setDupes] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    setSaving(true)
    setError(null)
    const { note, ...fields } = f
    const d = lead
      ? await send(`/api/admin/leads/${lead.id}`, 'PATCH', fields)
      : await send('/api/admin/leads', 'POST', { ...fields, note })
    setSaving(false)
    if (!d.success) {
      setError(d.error ?? 'Could not save.')
      return
    }
    const dup = d.duplicates as
      | { leads: { firstName: string; lastName: string | null }[]; athletes: { firstName: string; lastName: string }[] }
      | undefined
    const names = [
      ...(dup?.athletes ?? []).map((a) => `${a.firstName} ${a.lastName} (athlete)`),
      ...(dup?.leads ?? []).map((l) => `${fullName(l)} (lead)`),
    ]
    if (names.length) {
      setDupes(`Saved. Same phone or email as ${names.join(', ')} — possibly the same family.`)
      setTimeout(() => onSaved(d.data.id), 2500)
      return
    }
    onSaved(d.data.id)
  }

  return (
    <Sheet title={lead ? 'Edit details' : 'New lead'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Label text="Athlete first name">
          <input value={f.firstName} onChange={set('firstName')} className={inputCls} autoFocus={!lead} />
        </Label>
        <Label text="Last name">
          <input value={f.lastName} onChange={set('lastName')} className={inputCls} />
        </Label>
      </div>
      <Label text="Parent / guardian">
        <input value={f.parentName} onChange={set('parentName')} className={inputCls} placeholder="If a minor" />
      </Label>
      <div className="grid grid-cols-2 gap-2">
        <Label text="Phone">
          <input value={f.phone} onChange={set('phone')} inputMode="tel" className={inputCls} />
        </Label>
        <Label text="Email">
          <input value={f.email} onChange={set('email')} inputMode="email" className={inputCls} />
        </Label>
      </div>
      <Label text="What they're after">
        <input value={f.interest} onChange={set('interest')} className={inputCls} placeholder="Speed work, basketball group…" />
      </Label>
      <Label text="How they found us">
        <Pills value={f.source} options={SOURCES} onChange={(v) => setF({ ...f, source: v })} />
      </Label>
      <input value={f.sourceDetail} onChange={set('sourceDetail')} className={inputCls} placeholder="Details (who referred them, which event)" />
      <div className="grid grid-cols-2 gap-2">
        <Label text="Birthdate">
          <input type="date" value={f.birthdate} onChange={set('birthdate')} className={inputCls} />
        </Label>
        <Label text="Follow up on">
          <input type="date" value={f.followUpOn} onChange={set('followUpOn')} className={inputCls} />
        </Label>
      </div>
      {locations.length > 0 && (
        <Label text="Gym">
          <Pills
            value={f.location}
            options={[{ value: '', label: 'Either' }, ...locations.map((l) => ({ value: l, label: l }))]}
            onChange={(v) => setF({ ...f, location: v })}
          />
        </Label>
      )}
      <Label text="Waiting on a group? (optional)">
        <select value={f.groupId} onChange={set('groupId')} className={inputCls}>
          <option value="">No specific group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Label>
      {!lead && (
        <Label text="First note">
          <textarea
            value={f.note}
            onChange={set('note')}
            rows={2}
            className="w-full px-3 py-2 bg-black/5 rounded-xl text-black"
            placeholder="DM'd asking about summer speed camp"
          />
        </Label>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {dupes && <p className="text-sm text-amber-800">{dupes}</p>}
      <button
        onClick={save}
        disabled={saving || !f.firstName.trim()}
        className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </Sheet>
  )
}

function LeadSheet({
  lead,
  groups,
  trainers,
  onClose,
  onChanged,
}: {
  lead: Lead
  groups: { id: string; name: string }[]
  trainers: { id: string; name: string }[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [contacted, setContacted] = useState(true)
  const [next, setNext] = useState<string>(inDays(3))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState<{ athleteId: string; name: string; message: string } | null>(null)
  const [convertLast, setConvertLast] = useState(lead.lastName ?? '')
  const [convertCoach, setConvertCoach] = useState('')

  const closed = lead.status === 'converted' || lead.status === 'lost'
  const group = groups.find((g) => g.id === lead.groupId)?.name

  async function run(p: Promise<{ success: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const d = await p
    setBusy(false)
    if (!d.success) {
      setError(d.error ?? 'Could not save.')
      return false
    }
    await onChanged()
    return true
  }

  async function logNote() {
    const ok = await run(
      send(`/api/admin/leads/${lead.id}/notes`, 'POST', {
        body: note,
        contacted,
        followUpOn: closed ? undefined : next || null,
      })
    )
    if (ok) setNote('')
  }

  async function setStatus(status: Status) {
    let lostReason: string | null | undefined
    if (status === 'lost') {
      lostReason = prompt('Why? (optional — e.g. "went with another gym", "price")', '')
      if (lostReason === null) return
    }
    await run(send(`/api/admin/leads/${lead.id}`, 'PATCH', { status, ...(lostReason ? { lostReason } : {}) }))
  }

  async function convert() {
    setBusy(true)
    setError(null)
    const d = await send(`/api/admin/leads/${lead.id}/convert`, 'POST', {
      lastName: convertLast,
      trainerId: convertCoach || null,
      addToGroup: true,
    })
    setBusy(false)
    if (!d.success) {
      setError(d.error ?? 'Could not convert.')
      return
    }
    const r = d.data
    const parts = [`${r.name} is now an athlete.`]
    if (r.group?.added) parts.push(`Added to ${r.group.name}.`)
    else if (r.group && !r.group.added) parts.push(`Couldn't add to ${r.group.name}: ${r.group.reason}`)
    parts.push('They still need a signed waiver — send the link from their profile.')
    setConverted({ athleteId: r.athleteId, name: r.name, message: parts.join(' ') })
    setConverting(false)
    await onChanged()
  }

  async function remove() {
    if (!confirm(`Delete ${fullName(lead)} completely? Use "Lost" instead if they were a real lead.`)) return
    const ok = await run(send(`/api/admin/leads/${lead.id}`, 'DELETE'))
    if (ok) onClose()
  }

  if (editing) {
    return (
      <LeadForm
        lead={lead}
        groups={groups}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          await onChanged()
          setEditing(false)
        }}
      />
    )
  }

  return (
    <Sheet title={fullName(lead)} onClose={onClose}>
      <div className="text-sm text-black/60 -mt-2">
        {lead.parentName && <div>Parent: {lead.parentName}</div>}
        {lead.interest && <div>Wants: {lead.interest}</div>}
        <div>
          {SOURCE_LABEL[lead.source] ?? lead.source}
          {lead.sourceDetail ? ` — ${lead.sourceDetail}` : ''} · added{' '}
          {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {lead.location ? ` · ${lead.location}` : ''}
          {group ? ` · waiting on ${group}` : ''}
        </div>
        {lead.lostReason && lead.status === 'lost' && <div>Lost: {lead.lostReason}</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.phone && (
          <>
            <a href={smsHref(lead.phone)!} className="h-10 px-4 rounded-full bg-black text-white text-sm font-semibold flex items-center">
              Text {formatPhonePretty(lead.phone)}
            </a>
            <a href={telHref(lead.phone)!} className="h-10 px-4 rounded-full bg-black/10 text-black text-sm font-semibold flex items-center">
              Call
            </a>
          </>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="h-10 px-4 rounded-full bg-black/10 text-black text-sm font-semibold flex items-center">
            Email
          </a>
        )}
        <button onClick={() => setEditing(true)} className="h-10 px-4 rounded-full bg-black/5 text-black/70 text-sm font-semibold">
          Edit details
        </button>
      </div>

      {converted && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
          {converted.message}{' '}
          <Link href={`/admin/athletes/${converted.athleteId}`} className="underline font-semibold">
            Open profile
          </Link>
        </div>
      )}

      {lead.status === 'converted' && lead.convertedAthleteId && !converted && (
        <Link
          href={`/admin/athletes/${lead.convertedAthleteId}`}
          className="block rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 font-semibold"
        >
          Member now — open their profile →
        </Link>
      )}

      {!closed && (
        <div>
          <div className="dsc-label text-black/50 mb-1.5">Stage</div>
          <Pills
            value={lead.status}
            options={(['new', 'contacted', 'trial', 'waitlist'] as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            onChange={(s) => setStatus(s)}
          />
        </div>
      )}

      {/* Log a touch + pick the next date: the one thing to do every time. */}
      <div className="rounded-2xl bg-black/[0.04] p-3 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={closed ? 'Add a note' : 'What happened? "Texted — trying Tuesday 5pm"'}
          className="w-full px-3 py-2 bg-white rounded-xl text-black text-sm"
        />
        {!closed && (
          <>
            <label className="flex items-center gap-2 text-sm text-black/70">
              <input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} className="w-4 h-4 accent-black" />
              I reached out / talked to them
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="dsc-label text-black/50 mr-1">Next follow-up</span>
              {[
                { l: 'Tomorrow', v: inDays(1) },
                { l: '3 days', v: inDays(3) },
                { l: '1 week', v: inDays(7) },
                { l: '2 weeks', v: inDays(14) },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => setNext(o.v)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold ${next === o.v ? 'bg-black text-white' : 'bg-white text-black/70'}`}
                >
                  {o.l}
                </button>
              ))}
              <input
                type="date"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="h-8 px-2 bg-white rounded-full text-xs text-black"
                aria-label="Follow-up date"
              />
            </div>
          </>
        )}
        <button
          onClick={logNote}
          disabled={busy || !note.trim()}
          className="w-full h-10 bg-black text-white rounded-full text-sm font-semibold disabled:bg-black/30"
        >
          {closed ? 'Add note' : `Save note · next ${next ? prettyDate(next) : 'not set'}`}
        </button>
        {!closed && lead.followUpOn && (
          <p className="text-xs text-black/50">Currently set: {prettyDate(lead.followUpOn)}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!closed &&
        (converting ? (
          <div className="rounded-2xl border border-black/10 p-3 space-y-2">
            <div className="text-sm font-semibold text-black">Make {lead.firstName} an athlete</div>
            {!lead.lastName && (
              <input value={convertLast} onChange={(e) => setConvertLast(e.target.value)} placeholder="Last name (needed)" className={inputCls} />
            )}
            <select value={convertCoach} onChange={(e) => setConvertCoach(e.target.value)} className={inputCls}>
              <option value="">No coach assigned yet</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {group && <p className="text-xs text-black/60">They&rsquo;ll also be added to {group}.</p>}
            {!lead.email && (
              <p className="text-xs text-amber-800">No email on file, so they won&rsquo;t get emails until one is added.</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={convert}
                disabled={busy || !(lead.lastName || convertLast.trim())}
                className="flex-1 h-10 bg-emerald-700 text-white rounded-full text-sm font-semibold disabled:opacity-40"
              >
                Convert
              </button>
              <button onClick={() => setConverting(false)} className="h-10 px-4 rounded-full bg-black/5 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setConverting(true)}
              className="flex-1 h-11 bg-emerald-700 text-white rounded-full text-sm font-semibold"
            >
              They signed up → make athlete
            </button>
            <button onClick={() => setStatus('lost')} className="h-11 px-4 rounded-full bg-black/5 text-black/70 text-sm font-semibold">
              Lost
            </button>
          </div>
        ))}

      {lead.status === 'lost' && (
        <button onClick={() => setStatus('contacted')} className="w-full h-10 rounded-full bg-black/5 text-sm font-semibold text-black/70">
          Reopen
        </button>
      )}

      <div>
        <div className="dsc-label text-black/50 mb-2">History</div>
        {lead.notes.length === 0 ? (
          <p className="text-sm text-black/40">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {lead.notes.map((n) => (
              <div key={n.id} className="text-sm">
                <div className="text-black whitespace-pre-wrap">{n.body}</div>
                <div className="dsc-label text-black/40 mt-0.5">
                  {new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {n.byName ? ` · ${n.byName}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={remove} className="w-full dsc-label text-red-700/60 hover:text-red-700 py-2">
        Delete lead
      </button>
    </Sheet>
  )
}
