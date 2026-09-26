'use client'

// Injuries, PT and conditions for one athlete. The same card serves the staff
// profile and the family dashboard; only the API base and the wording differ.

import { useCallback, useEffect, useState } from 'react'

type Kind = 'injury' | 'pt' | 'condition'

interface Note {
  id: string
  kind: Kind
  title: string
  details: string | null
  since: string | null
  active: boolean
  createdByRole: 'staff' | 'family'
  createdByName: string | null
  updatedByName: string | null
  updatedAt: string
  /** Staff only. */
  ptStatus?: 'flagged' | 'following' | 'cleared' | null
  commentCount?: number
}

const KIND_LABEL: Record<Kind, string> = {
  injury: 'Injury',
  pt: 'Physical therapy',
  condition: 'Condition',
}

interface Props {
  /** e.g. `/api/athletes/abc/health` or `/api/athletes/me/health` */
  base: string
  /** Appended to every request, e.g. `?athleteId=…` for a family with siblings. */
  query?: string
  audience: 'staff' | 'family'
}

export function HealthNotes({ base, query = '', audience }: Props) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`${base}${query}`)
    const d = await r.json().catch(() => null)
    if (d?.success) setNotes(d.data)
  }, [base, query])

  useEffect(() => {
    load()
  }, [load])

  async function call(url: string, method: string, body?: unknown) {
    setError(null)
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const d = await r.json().catch(() => ({ success: false }))
    if (!d.success) {
      setError(d.error ?? 'Could not save.')
      return false
    }
    await load()
    return true
  }

  async function flag(n: Note) {
    const message = prompt(`Flag "${n.title}" for the PT. Add a note for them (optional):`, '')
    if (message === null) return
    await call(`/api/injuries/${n.id}/flag`, 'POST', { message })
  }

  const active = (notes ?? []).filter((n) => n.active)
  const past = (notes ?? []).filter((n) => !n.active)

  return (
    <div className="rounded-3xl bg-black/[0.04] p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="dsc-label text-black/40">Health &amp; injuries</div>
        <button
          onClick={() => setEditing('new')}
          className="dsc-label px-3 py-1.5 rounded-full bg-white text-black hover:bg-black/5"
        >
          + Add
        </button>
      </div>

      {notes === null ? (
        <div className="dsc-label text-black/30">Loading…</div>
      ) : active.length === 0 ? (
        <p className="text-sm text-black/50">
          {audience === 'family'
            ? 'Nothing on file. Add any injury, physical therapy or condition the coaches should know about.'
            : 'Nothing current on file.'}
        </p>
      ) : (
        <div className="space-y-2">
          {active.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              onEdit={() => setEditing(n)}
              onFlag={audience === 'staff' ? () => flag(n) : undefined}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowPast((v) => !v)} className="dsc-label text-black/40 hover:text-black">
            {showPast ? 'Hide' : 'Show'} past · {past.length}
          </button>
          {showPast && (
            <div className="space-y-2 mt-2">
              {past.map((n) => (
                <NoteRow key={n.id} note={n} onEdit={() => setEditing(n)} />
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}

      {audience === 'family' && (
        <p className="text-xs text-black/40 mt-3">Only DSC coaches and your family can see this.</p>
      )}

      {editing && (
        <NoteSheet
          note={editing === 'new' ? null : editing}
          audience={audience}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok =
              editing === 'new'
                ? await call(`${base}${query}`, 'POST', body)
                : await call(`${base}/${editing.id}${query}`, 'PATCH', body)
            if (ok) setEditing(null)
          }}
          onDelete={
            editing !== 'new' && (audience === 'staff' || editing.createdByRole === 'family')
              ? async () => {
                  if (!confirm('Delete this note? Marking it resolved keeps the history instead.')) return
                  const ok = await call(`${base}/${editing.id}${query}`, 'DELETE')
                  if (ok) setEditing(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function NoteRow({ note, onEdit, onFlag }: { note: Note; onEdit: () => void; onFlag?: () => void }) {
  const tone = !note.active
    ? 'bg-white/60 text-black/50'
    : note.kind === 'condition'
      ? 'bg-white text-black'
      : 'bg-rose-50 text-rose-950'
  const withPT = note.ptStatus === 'flagged' || note.ptStatus === 'following'
  return (
    <div className={`rounded-2xl ${tone}`}>
      <button onClick={onEdit} className="w-full text-left px-4 pt-3 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-semibold truncate">{note.title}</div>
          <span className="dsc-label opacity-60 shrink-0">{note.active ? KIND_LABEL[note.kind] : 'Past'}</span>
        </div>
        {note.details && <div className="text-sm opacity-80 mt-0.5 whitespace-pre-wrap">{note.details}</div>}
        <div className="dsc-label opacity-50 mt-1">
          {note.since ? `Since ${note.since} · ` : ''}
          {note.createdByRole === 'family' ? 'From family' : `From ${note.createdByName ?? 'staff'}`}
          {note.updatedByName && note.updatedByName !== note.createdByName ? ` · edited by ${note.updatedByName}` : ''}
        </div>
      </button>
      {/* Staff only: PT follow-up. Outside the button — no nested controls. */}
      {onFlag && note.active && note.kind !== 'condition' && (
        <div className="px-4 pb-3 -mt-1">
          {withPT ? (
            <a href={`/injuries#${note.id}`} className="dsc-label inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-900">
              {note.ptStatus === 'flagged' ? 'With PT · new' : 'PT following up'}
              {note.commentCount ? ` · ${note.commentCount} notes` : ''} →
            </a>
          ) : (
            <button onClick={onFlag} className="dsc-label px-2 py-1 rounded-full bg-white text-black hover:bg-black/5">
              Flag for PT
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NoteSheet({
  note,
  audience,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note | null
  audience: 'staff' | 'family'
  onClose: () => void
  onSave: (body: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [kind, setKind] = useState<Kind>(note?.kind ?? 'injury')
  const [title, setTitle] = useState(note?.title ?? '')
  const [details, setDetails] = useState(note?.details ?? '')
  const [since, setSince] = useState(note?.since ?? '')
  const [active, setActive] = useState(note?.active ?? true)
  const [saving, setSaving] = useState(false)

  const placeholder =
    kind === 'pt' ? 'e.g. Knee rehab at Baylor PT' : kind === 'condition' ? 'e.g. Asthma — inhaler in bag' : 'e.g. Left ankle sprain'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[88vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="dsc-headline text-2xl text-black">{note ? 'Edit note' : 'Add health note'}</div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`h-10 rounded-full text-xs font-semibold ${
                  kind === k ? 'bg-black text-white' : 'bg-black/5 text-black/70'
                }`}
              >
                {k === 'pt' ? 'PT' : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={placeholder}
            className="w-full h-12 px-3 bg-black/5 rounded-xl text-black"
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={
              audience === 'family'
                ? 'Anything the coach should avoid or watch for'
                : 'Restrictions, what to avoid, who cleared them'
            }
            className="w-full px-3 py-2 bg-black/5 rounded-xl text-black"
          />
          <input
            value={since}
            onChange={(e) => setSince(e.target.value)}
            maxLength={60}
            placeholder="Since when? (optional)"
            className="w-full h-12 px-3 bg-black/5 rounded-xl text-black"
          />
          {kind !== 'condition' && (
            <label className="flex items-center gap-3 text-sm text-black/70">
              <input
                type="checkbox"
                checked={!active}
                onChange={(e) => setActive(!e.target.checked)}
                className="w-5 h-5 accent-black"
              />
              Healed / finished — keep as past history
            </label>
          )}
          <button
            onClick={async () => {
              setSaving(true)
              await onSave({ kind, title, details, since, active })
              setSaving(false)
            }}
            disabled={saving || title.trim().length === 0}
            className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="w-full dsc-label text-red-700/70 hover:text-red-700 py-2">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
