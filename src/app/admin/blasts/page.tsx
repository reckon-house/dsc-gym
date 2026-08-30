'use client'

// Gym announcements.
//
// Two steps on purpose, matching the scheduler's propose→commit: writing the
// message produces a DRAFT that reports exactly who it would reach and who it
// would skip, and only a second, explicit click sends. Nothing on this page
// puts mail in an inbox without the count having been read first.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'

interface GroupOpt {
  id: string
  name: string
}

interface Preview {
  blastId: string
  audienceLabel: string
  recipientCount: number
  excluded: { optedOut: number; badEmail: number; noBirthdate: number }
  sample: string[]
}

interface BlastRow {
  id: string
  subject: string
  audienceLabel: string
  status: string
  recipientCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  sentAt: string | null
  source: string
}

type AudienceKind = 'all' | 'group' | 'age_band'

export default function BlastsPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<GroupOpt[]>([])
  const [history, setHistory] = useState<BlastRow[]>([])

  const [kind, setKind] = useState<AudienceKind>('all')
  const [groupId, setGroupId] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/admin/blasts')
    const data = await res.json()
    if (data.success) setHistory(data.data)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
    fetch('/api/admin/groups')
      .then((r) => r.json())
      .then((d) => d.success && setGroups(d.data))
  }, [router])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  function audienceSpec() {
    if (kind === 'all') return { kind: 'all' }
    if (kind === 'group') return { kind: 'group', groupId }
    return {
      kind: 'age_band',
      minAge: minAge === '' ? undefined : Number(minAge),
      maxAge: maxAge === '' ? undefined : Number(maxAge),
    }
  }

  async function buildPreview() {
    setError(null)
    setResult(null)
    if (!subject.trim() || !body.trim()) {
      setError('Both a subject and a message are needed.')
      return
    }
    if (kind === 'group' && !groupId) {
      setError('Pick a group.')
      return
    }
    if (kind === 'age_band' && minAge === '' && maxAge === '') {
      setError('Set at least one end of the age range.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/blasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          audience: audienceSpec(),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not work out who that would reach.')
        return
      }
      setPreview(data.data)
      loadHistory()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmSend() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/blasts/${preview.blastId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not send.')
        return
      }
      setResult(
        `Sent to ${data.data.sent} ${data.data.sent === 1 ? 'mailbox' : 'mailboxes'}${
          data.data.failed ? ` · ${data.data.failed} failed` : ''
        }.`
      )
      setPreview(null)
      setSubject('')
      setBody('')
      loadHistory()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    if (!preview) return
    setBusy(true)
    await fetch(`/api/admin/blasts/${preview.blastId}`, { method: 'DELETE' })
    setBusy(false)
    setPreview(null)
    loadHistory()
  }

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Announcements" />
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        {result && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 mb-4">
            {result}
          </div>
        )}

        {/* Composer */}
        <div className="rounded-3xl bg-black/[0.04] p-5 space-y-4 mb-8">
          <div>
            <div className="dsc-label text-black/50 mb-1.5">Who gets it</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['all', 'Everyone'],
                  ['group', 'A group'],
                  ['age_band', 'By age'],
                ] as [AudienceKind, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k)
                    setPreview(null)
                  }}
                  className={`h-11 rounded-xl text-sm font-medium ${
                    kind === k ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/[0.05]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {kind === 'group' && (
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value)
                setPreview(null)
              }}
              className="w-full h-11 px-3 bg-white rounded-xl text-black"
            >
              <option value="">Choose a group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          {kind === 'age_band' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="dsc-label text-black/50 mb-1">Youngest</div>
                <input
                  value={minAge}
                  onChange={(e) => {
                    setMinAge(e.target.value)
                    setPreview(null)
                  }}
                  inputMode="numeric"
                  placeholder="10"
                  className="w-full h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
                />
              </label>
              <label className="block">
                <div className="dsc-label text-black/50 mb-1">Oldest</div>
                <input
                  value={maxAge}
                  onChange={(e) => {
                    setMaxAge(e.target.value)
                    setPreview(null)
                  }}
                  inputMode="numeric"
                  placeholder="14"
                  className="w-full h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
                />
              </label>
            </div>
          )}

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">Subject</div>
            <input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                setPreview(null)
              }}
              placeholder="The gym is closed Monday"
              className="w-full h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
            />
          </label>

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">Message</div>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setPreview(null)
              }}
              rows={6}
              placeholder="Write it the way you'd say it."
              className="w-full px-3 py-2.5 bg-white rounded-xl text-black placeholder:text-black/30 resize-y"
            />
          </label>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {!preview ? (
            <button
              onClick={buildPreview}
              disabled={busy}
              className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base disabled:bg-black/30"
            >
              {busy ? 'Checking…' : 'See who this reaches'}
            </button>
          ) : (
            <div className="rounded-2xl bg-white border-2 border-black p-4 space-y-3">
              <div>
                <div className="dsc-label text-black/40">This will send to</div>
                <div className="dsc-headline text-4xl text-black leading-none mt-1">
                  {preview.recipientCount}
                </div>
                <div className="dsc-label text-black/50 mt-1">
                  {preview.recipientCount === 1 ? 'mailbox' : 'mailboxes'} ·{' '}
                  {preview.audienceLabel}
                </div>
              </div>

              {preview.sample.length > 0 && (
                <div className="text-sm text-black/60">
                  {preview.sample.join(', ')}
                  {preview.recipientCount > preview.sample.length && ', …'}
                </div>
              )}

              {/* Exclusions are stated plainly — a silent skip is how someone
                  ends up wondering why they never heard about the closure. */}
              {(preview.excluded.optedOut > 0 ||
                preview.excluded.badEmail > 0 ||
                preview.excluded.noBirthdate > 0) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                  <div className="font-semibold mb-1">Not included:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {preview.excluded.optedOut > 0 && (
                      <li>{preview.excluded.optedOut} unsubscribed from announcements</li>
                    )}
                    {preview.excluded.badEmail > 0 && (
                      <li>{preview.excluded.badEmail} have no real email on file</li>
                    )}
                    {preview.excluded.noBirthdate > 0 && (
                      <li>
                        {preview.excluded.noBirthdate} have no birthdate, so they can&rsquo;t
                        be age-filtered
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={discard}
                  disabled={busy}
                  className="flex-1 h-12 rounded-full border border-black/20 text-black/60 font-semibold disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  onClick={confirmSend}
                  disabled={busy}
                  className="flex-1 h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
                >
                  {busy ? 'Sending…' : `Send to ${preview.recipientCount}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="dsc-label text-black/40 mb-2">Sent before</div>
        {history.length === 0 ? (
          <div className="rounded-3xl bg-black/[0.04] p-8 text-center">
            <p className="text-sm text-black/60">Nothing sent yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl bg-black/[0.04] px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-black truncate">{b.subject}</div>
                  <div className="dsc-label text-black/40 mt-0.5">
                    {b.audienceLabel} ·{' '}
                    {new Date(b.sentAt ?? b.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {b.source === 'ai_chat' ? ' · via chat' : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill status={b.status} />
                  {b.status === 'sent' && (
                    <div className="dsc-label text-black/40 mt-1">
                      {b.sentCount} sent
                      {b.failedCount > 0 ? ` · ${b.failedCount} failed` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'sent'
      ? 'bg-emerald-100 text-emerald-900'
      : status === 'draft'
        ? 'bg-amber-100 text-amber-900'
        : status === 'failed'
          ? 'bg-red-100 text-red-900'
          : 'bg-black/10 text-black/50'
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${tone}`}>
      {status}
    </span>
  )
}
