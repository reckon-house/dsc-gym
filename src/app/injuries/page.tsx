'use client'

// Injury follow-ups: coaches flag, the PT follows up, both talk here, the PT
// clears. Staff only — families never see this thread.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { homeFor, useStaff } from '../schedule/useStaff'

interface Comment {
  id: string
  body: string
  byName: string | null
  createdAt: string
}

interface Item {
  id: string
  athleteId: string
  athleteName: string
  title: string
  details: string | null
  since: string | null
  ptStatus: 'flagged' | 'following' | 'cleared'
  flaggedAt: string | null
  flaggedByName: string | null
  clearedAt: string | null
  clearedByName: string | null
  comments: Comment[]
}

interface AthleteOpt {
  id: string
  firstName: string
  lastName: string
}

const STATUS: Record<Item['ptStatus'], { label: string; cls: string }> = {
  flagged: { label: 'New', cls: 'bg-rose-100 text-rose-900' },
  following: { label: 'PT following up', cls: 'bg-amber-100 text-amber-900' },
  cleared: { label: 'Cleared', cls: 'bg-emerald-100 text-emerald-900' },
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json().catch(() => ({ success: false, error: 'Could not reach the server.' }))
}

export default function InjuriesPage() {
  const user = useStaff()
  const [view, setView] = useState<'open' | 'cleared'>('open')
  const [items, setItems] = useState<Item[] | null>(null)
  const [athletes, setAthletes] = useState<AthleteOpt[]>([])
  const [ptNames, setPtNames] = useState<string[]>([])
  const [iAmPT, setIAmPT] = useState(false)
  const [reporting, setReporting] = useState(false)
  // A link from a profile can point at one injury (#noteId).
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.location.hash ? window.location.hash.slice(1) : null
  )

  const load = useCallback(async () => {
    const d = await fetch(`/api/injuries?view=${view}`)
      .then((r) => r.json())
      .catch(() => null)
    if (d?.success) {
      setItems(d.data.items)
      setAthletes(d.data.athletes)
      setPtNames(d.data.ptNames)
      setIAmPT(d.data.iAmPT)
    }
  }, [view])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  const newCount = (items ?? []).filter((i) => i.ptStatus === 'flagged').length

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link href={homeFor(user)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70" aria-label="Back to home">
          ←
        </Link>
        <div className="dsc-headline text-lg md:text-xl text-black flex-1">Injury follow-ups</div>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-3">
        <p className="text-xs text-black/50">
          Staff only — families don&rsquo;t see these notes.{' '}
          {ptNames.length ? `PT: ${ptNames.join(', ')}.` : 'No PT is set yet (Staff page).'}
        </p>

        <div className="flex items-center gap-2">
          {(['open', 'cleared'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`h-10 px-4 rounded-full text-sm font-semibold ${view === v ? 'bg-black text-white' : 'bg-black/5 text-black/70'}`}
            >
              {v === 'open' ? `Open${iAmPT && newCount ? ` · ${newCount} new` : ''}` : 'Cleared'}
            </button>
          ))}
          <button onClick={() => setReporting(true)} className="ml-auto h-10 px-4 rounded-full bg-rose-700 text-white text-sm font-semibold shrink-0">
            + Report injury
          </button>
        </div>

        {items === null ? (
          <div className="dsc-label text-black/40 py-8 text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center text-sm text-black/60">
            {view === 'open' ? 'Nothing waiting on the PT.' : 'Nothing cleared in the last 30 days.'}
          </div>
        ) : (
          items.map((i) => (
            <Thread key={i.id} item={i} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} iAmPT={iAmPT} isAdmin={user?.role === 'ADMIN'} onChanged={load} />
          ))
        )}
      </div>

      {reporting && (
        <ReportSheet
          athletes={athletes}
          ptNames={ptNames}
          onClose={() => setReporting(false)}
          onSaved={() => {
            setReporting(false)
            setView('open')
            load()
          }}
        />
      )}
    </div>
  )
}

function Thread({
  item,
  open,
  onToggle,
  iAmPT,
  isAdmin,
  onChanged,
}: {
  item: Item
  open: boolean
  onToggle: () => void
  iAmPT: boolean
  isAdmin: boolean
  onChanged: () => void
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = item.comments[item.comments.length - 1]

  async function act(p: Promise<{ success: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const d = await p
    setBusy(false)
    if (!d.success) setError(d.error ?? 'Could not save.')
    else onChanged()
    return d.success
  }

  return (
    <div id={item.id} className="rounded-3xl bg-black/[0.04] overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-black truncate">{item.athleteName}</div>
            <div className="text-sm text-black/70 truncate">{item.title}</div>
          </div>
          <span className={`dsc-label px-2 py-1 rounded-full shrink-0 ${STATUS[item.ptStatus].cls}`}>{STATUS[item.ptStatus].label}</span>
        </div>
        <div className="dsc-label text-black/40 mt-1.5">
          {item.flaggedByName ? `Flagged by ${item.flaggedByName}` : ''}
          {item.flaggedAt ? ` · ${when(item.flaggedAt)}` : ''}
          {item.comments.length ? ` · ${item.comments.length} note${item.comments.length === 1 ? '' : 's'}` : ''}
        </div>
        {!open && last && <div className="text-xs text-black/50 mt-1 truncate">{last.byName}: {last.body}</div>}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {item.details && <div className="text-sm text-black/70 whitespace-pre-wrap">{item.details}</div>}
          <div className="space-y-2">
            {item.comments.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white px-3 py-2">
                <div className="text-sm text-black whitespace-pre-wrap">{c.body}</div>
                <div className="dsc-label text-black/40 mt-0.5">
                  {c.byName} · {when(c.createdAt)}
                </div>
              </div>
            ))}
          </div>

          {item.ptStatus !== 'cleared' ? (
            <>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder={iAmPT ? 'e.g. Evaluated — no jumping for 2 weeks, light lifting OK' : 'Add an update for the PT'}
                className="w-full px-3 py-2 bg-white rounded-xl text-sm text-black"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    if (await act(post(`/api/injuries/${item.id}/comments`, { body: reply }))) setReply('')
                  }}
                  disabled={busy || !reply.trim()}
                  className="h-10 px-4 rounded-full bg-black text-white text-sm font-semibold disabled:bg-black/30"
                >
                  Send
                </button>
                {(iAmPT || isAdmin) && (
                  <button
                    onClick={() => {
                      if (confirm(`Mark ${item.athleteName} cleared? It moves to past injuries and the flag comes off attendance.`)) {
                        act(post(`/api/injuries/${item.id}/status`, { status: 'cleared' }))
                      }
                    }}
                    disabled={busy}
                    className="h-10 px-4 rounded-full bg-emerald-700 text-white text-sm font-semibold"
                  >
                    Cleared
                  </button>
                )}
                {isAdmin && (
                  <Link href={`/admin/athletes/${item.athleteId}`} className="h-10 px-4 rounded-full bg-black/5 text-sm flex items-center">
                    Profile
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 text-sm text-black/60">
              <span>
                Cleared by {item.clearedByName}
                {item.clearedAt ? ` · ${when(item.clearedAt)}` : ''}
              </span>
              <button onClick={() => act(post(`/api/injuries/${item.id}/status`, { status: 'reopen' }))} className="dsc-label text-black/50 hover:text-black">
                Reopen
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}

function ReportSheet({
  athletes,
  ptNames,
  onClose,
  onSaved,
}: {
  athletes: AthleteOpt[]
  ptNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [q, setQ] = useState('')
  const [athlete, setAthlete] = useState<AthleteOpt | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [flag, setFlag] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (n.length < 2) return []
    return athletes.filter((a) => `${a.firstName} ${a.lastName}`.toLowerCase().includes(n)).slice(0, 6)
  }, [q, athletes])

  async function save() {
    if (!athlete) return
    setBusy(true)
    setError(null)
    const d = await post('/api/injuries', { athleteId: athlete.id, title, details, flag, message })
    setBusy(false)
    if (!d.success) setError(d.error ?? 'Could not save.')
    else onSaved()
  }

  const pt = ptNames.length ? ptNames.join(' / ') : 'the PT'
  const inp = 'w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[90vh] overflow-y-auto dsc-sheet-panel p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="dsc-headline text-2xl text-black">Report injury</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/5 text-black/60" aria-label="Close">
            ✕
          </button>
        </div>

        {athlete ? (
          <div className="flex items-center justify-between rounded-xl bg-black/5 px-3 h-11">
            <span className="font-semibold text-black">
              {athlete.firstName} {athlete.lastName}
            </span>
            <button onClick={() => setAthlete(null)} className="dsc-label text-black/50">
              Change
            </button>
          </div>
        ) : (
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Athlete — type a name" autoFocus className={inp} />
            <div className="mt-1 space-y-1">
              {matches.map((a) => (
                <button key={a.id} onClick={() => setAthlete(a)} className="w-full text-left h-10 px-3 rounded-xl hover:bg-black/5 text-sm font-semibold">
                  {a.firstName} {a.lastName}
                </button>
              ))}
            </div>
          </div>
        )}

        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder='What happened? e.g. "Rolled left ankle"' className={inp} />
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="Details (when, how, what they can't do)"
          className="w-full px-3 py-2 bg-black/5 rounded-xl text-black placeholder:text-black/30"
        />
        <label className="flex items-center gap-3 text-sm text-black">
          <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} className="w-4 h-4 accent-black" />
          Flag for {pt} to follow up
        </label>
        {flag && (
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Note for ${pt} (optional)`} className={inp} />
        )}
        <p className="text-xs text-black/50">
          The injury goes on their profile (the family can see it&rsquo;s there). Your notes with the PT stay staff-only.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button onClick={save} disabled={busy || !athlete || !title.trim()} className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30">
          {busy ? 'Saving…' : flag ? `Save & send to ${pt}` : 'Save'}
        </button>
      </div>
    </div>
  )
}
