'use client'

// Staff: who can sign in, and as what.
//
// Every staff change so far has been a manual database write — a role, an
// email, archiving people, adding the front desk. This is that, in the app.
//
// Two distinctions the page has to make legible, because conflating them is
// what caused the earlier mess:
//   - ADMIN vs TRAINER is what you can DO in the app.
//   - "Coach" is whether sessions are booked AGAINST you. Front desk is an
//     admin who is not a coach; a coach need not be an admin.
// And an unreachable email is called out, because that silently costs someone
// their reminders and the morning digest.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '../_components/AdminHeader'

interface Staff {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'TRAINER'
  active: boolean
  isCoach: boolean
  hasTrainerRecord: boolean
  athletes: number
  sessions: number
  reachable: boolean
  isSelf: boolean
}

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newLogin, setNewLogin] = useState<{ name: string; email: string; password: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/staff')
    const d = await r.json()
    setLoading(false)
    if (d.success) setStaff(d.data)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
      })
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  async function patch(id: string, body: Record<string, unknown>, what: string) {
    setError(null)
    setBanner(null)
    const r = await fetch(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (!d.success) {
      setError(d.error ?? `Could not ${what}.`)
      return false
    }
    setBanner(d.note ?? `${what} — saved.`)
    await load()
    return true
  }

  const active = staff.filter((s) => s.active)
  const disabled = staff.filter((s) => !s.active)
  const unreachable = active.filter((s) => !s.reachable)

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader title="Staff" />
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        <button
          onClick={() => {
            setAdding(true)
            setError(null)
          }}
          className="w-full mb-4 h-12 bg-black text-white rounded-full dsc-headline text-base"
        >
          + Add someone
        </button>

        {newLogin && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 mb-4">
            <div className="font-semibold mb-1">{newLogin.name} can now sign in:</div>
            <div className="font-mono text-black break-all">{newLogin.email}</div>
            <div className="font-mono text-base text-black break-all mt-1">{newLogin.password}</div>
            <p className="mt-2">
              Give this to them directly — it&rsquo;s the only time it&rsquo;s shown. They should
              change it on their Account page.
            </p>
            <button
              onClick={() => setNewLogin(null)}
              className="mt-2 underline underline-offset-2 font-semibold"
            >
              Done
            </button>
          </div>
        )}

        {banner && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 mb-4 flex items-start justify-between gap-3">
            <span>{banner}</span>
            <button onClick={() => setBanner(null)} className="shrink-0 opacity-50 hover:opacity-100" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-4">
            {error}
          </div>
        )}

        {unreachable.length > 0 && (
          <div className="rounded-2xl bg-black/[0.04] px-4 py-3 text-sm text-black/70 mb-4">
            <span className="font-semibold text-black">
              {unreachable.length} {unreachable.length === 1 ? 'person' : 'people'} the app can&rsquo;t email
            </span>{' '}
            — {unreachable.map((s) => s.name).join(', ')}. They get no session reminders and no
            morning digest until a real address is set.
          </div>
        )}

        {loading ? (
          <div className="dsc-label text-black/40 text-center py-8">Loading…</div>
        ) : (
          <>
            <div className="space-y-2">
              {active.map((s) => (
                <Row key={s.id} s={s} onEdit={() => setEditing(s)} />
              ))}
            </div>

            {disabled.length > 0 && (
              <>
                <div className="dsc-label text-black/40 mt-8 mb-2">Disabled — cannot sign in</div>
                <div className="space-y-2">
                  {disabled.map((s) => (
                    <Row key={s.id} s={s} onEdit={() => setEditing(s)} dim />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onCreated={(who) => {
            setAdding(false)
            setNewLogin(who)
            load()
          }}
        />
      )}

      {editing && (
        <EditSheet
          s={editing}
          onClose={() => setEditing(null)}
          onSave={async (body, what) => {
            const ok = await patch(editing.id, body, what)
            if (ok) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function Row({ s, onEdit, dim }: { s: Staff; onEdit: () => void; dim?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${dim ? 'bg-black/[0.02] opacity-60' : 'bg-black/[0.04]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-black truncate">
            {s.name}
            {s.isSelf && <span className="ml-2 dsc-label text-black/40">you</span>}
          </div>
          <div className="font-mono text-xs text-black/50 truncate mt-0.5">{s.email}</div>
          <div className="dsc-label text-black/50 mt-1">
            {s.role === 'ADMIN' ? 'Admin' : 'Trainer'}
            {s.isCoach ? ' · coach' : ''}
            {s.isCoach && s.athletes > 0 ? ` · ${s.athletes} athletes` : ''}
            {!s.reachable && <span className="text-amber-700"> · no working email</span>}
          </div>
        </div>
        <button onClick={onEdit} className="dsc-label text-black/50 hover:text-black shrink-0">
          Edit
        </button>
      </div>
    </div>
  )
}

function AddSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (who: { name: string; email: string; password: string }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'TRAINER'>('TRAINER')
  const [isCoach, setIsCoach] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setSaving(true)
    try {
      const r = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, isCoach }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not add them.')
        return
      }
      onCreated({ name: d.data.name, email: d.data.email, password: d.data.tempPassword })
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="New staff member" onClose={onClose}>
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="A real address — reminders go here"
          className="w-full h-11 px-3 bg-black/5 rounded-xl text-black placeholder:text-black/30"
        />
      </Field>

      <Field label="What can they do?">
        <div className="grid grid-cols-2 gap-2">
          {(['TRAINER', 'ADMIN'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`h-11 rounded-xl text-sm font-medium ${
                role === r ? 'bg-black text-white' : 'bg-black/5 text-black hover:bg-black/[0.08]'
              }`}
            >
              {r === 'ADMIN' ? 'Admin' : 'Trainer'}
            </button>
          ))}
        </div>
        <div className="text-xs text-black/40 mt-1.5">
          {role === 'ADMIN'
            ? 'Full access: the schedule, athletes, groups, announcements and staff.'
            : 'Their own schedule and their own athletes.'}
        </div>
      </Field>

      <label className="flex items-start gap-3 px-3 py-2.5 bg-black/[0.04] rounded-xl cursor-pointer">
        <input
          type="checkbox"
          checked={isCoach}
          onChange={(e) => setIsCoach(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-black shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-black">Sessions are booked with them</span>
          <span className="block text-xs text-black/50 mt-0.5">
            Puts them in coach pickers and on the availability grid. Leave off for front desk or
            office staff.
          </span>
        </span>
      </label>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={saving || !name.trim() || !email.trim()}
        className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/20"
      >
        {saving ? 'Adding…' : 'Add them'}
      </button>
      <p className="text-xs text-black/40">
        A password is generated and shown once so you can pass it on.
      </p>
    </Sheet>
  )
}

function EditSheet({
  s,
  onClose,
  onSave,
}: {
  s: Staff
  onClose: () => void
  onSave: (body: Record<string, unknown>, what: string) => Promise<void>
}) {
  const [name, setName] = useState(s.name)
  const [email, setEmail] = useState(s.email)
  const [role, setRole] = useState<'ADMIN' | 'TRAINER'>(s.role)
  const [isCoach, setIsCoach] = useState(s.isCoach)
  const [saving, setSaving] = useState(false)

  const changed =
    name !== s.name || email !== s.email || role !== s.role || isCoach !== s.isCoach

  return (
    <Sheet title={`Edit ${s.name}`} onClose={onClose}>
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full h-11 px-3 bg-black/5 rounded-xl text-black"
        />
      </Field>

      <Field label="Access">
        <div className="grid grid-cols-2 gap-2">
          {(['TRAINER', 'ADMIN'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`h-11 rounded-xl text-sm font-medium ${
                role === r ? 'bg-black text-white' : 'bg-black/5 text-black hover:bg-black/[0.08]'
              }`}
            >
              {r === 'ADMIN' ? 'Admin' : 'Trainer'}
            </button>
          ))}
        </div>
      </Field>

      <label className="flex items-start gap-3 px-3 py-2.5 bg-black/[0.04] rounded-xl cursor-pointer">
        <input
          type="checkbox"
          checked={isCoach}
          onChange={(e) => setIsCoach(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-black shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-black">Sessions are booked with them</span>
          <span className="block text-xs text-black/50 mt-0.5">
            Turning this off keeps their past sessions and athletes — it only takes them out of
            coach pickers.
          </span>
        </span>
      </label>

      <button
        onClick={async () => {
          setSaving(true)
          await onSave({ name, email, role, isCoach }, 'Updated')
          setSaving(false)
        }}
        disabled={saving || !changed}
        className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/20"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      <div className="pt-2 border-t border-black/10">
        {s.isSelf ? (
          <p className="text-xs text-black/40">
            You can&rsquo;t disable your own account or remove your own admin access — another
            admin has to do it.
          </p>
        ) : s.active ? (
          <>
            <button
              onClick={async () => {
                setSaving(true)
                await onSave({ active: false }, `${s.name} disabled`)
                setSaving(false)
              }}
              disabled={saving}
              className="w-full h-12 rounded-full border border-red-300 text-red-700 font-semibold disabled:opacity-50"
            >
              Disable this login
            </button>
            <p className="text-xs text-black/40 mt-2">
              They can no longer sign in. Nothing is deleted — their history, athletes and past
              sessions stay, and you can turn this back on.
            </p>
          </>
        ) : (
          <button
            onClick={async () => {
              setSaving(true)
              await onSave({ active: true }, `${s.name} re-enabled`)
              setSaving(false)
            }}
            disabled={saving}
            className="w-full h-12 rounded-full bg-black text-white font-semibold disabled:opacity-50"
          >
            Re-enable this login
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40 dsc-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[88vh] overflow-y-auto dsc-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="dsc-label text-black/40">Staff</div>
            <div className="dsc-headline text-2xl text-black">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-5 space-y-4">{children}</div>
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
