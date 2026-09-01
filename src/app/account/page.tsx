'use client'

// Your own account: change your password.
//
// Deliberately at /account rather than under /admin — trainers have passwords
// too, and middleware bounces them out of /admin. This page is the one place
// every staff member can reach.
//
// Admins additionally get a reset panel for other staff, because the previous
// answer to "Justin forgot his login" was a direct database write.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface Me {
  userId: string
  name: string
  email: string
  role: 'ADMIN' | 'TRAINER'
}

interface Staff {
  id: string
  name: string
  email: string
  role: string
}

const MIN_LEN = 10

export default function AccountPage() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const loadStaff = useCallback(async () => {
    const r = await fetch('/api/admin/staff')
    const d = await r.json()
    if (d.success) setStaff(d.data)
  }, [])

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/auth/me')
      const d = await r.json()
      if (!d.success) {
        router.replace('/login')
        return
      }
      setMe(d.user ?? d.data)
      if ((d.user ?? d.data)?.role === 'ADMIN') void loadStaff()
    })()
  }, [router, loadStaff])

  const tooShort = next.length > 0 && next.length < MIN_LEN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit =
    current.length > 0 && next.length >= MIN_LEN && next === confirm && !saving

  async function submit() {
    setError(null)
    setDone(false)
    setSaving(true)
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not change your password.')
        return
      }
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
        <Link
          href={me?.role === 'TRAINER' ? '/trainer' : '/admin'}
          aria-label="Back"
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
        <Image src="/logo-mark.png" alt="DSC" width={28} height={28} priority />
        <div className="ml-2 dsc-headline text-lg text-black">Account</div>
      </header>

      <div className="max-w-lg mx-auto w-full px-4 py-6">
        {me && (
          <div className="mb-6">
            <div className="dsc-label text-black/40">Signed in as</div>
            <div className="dsc-headline text-3xl text-black leading-none mt-1">
              {me.name}
            </div>
            <div className="font-mono text-sm text-black/60 mt-1">{me.email}</div>
            <div className="dsc-label text-black/40 mt-1">
              {me.role === 'ADMIN' ? 'Admin' : 'Trainer'}
            </div>
          </div>
        )}

        <div className="rounded-3xl bg-black/[0.04] p-5 space-y-4">
          <div className="dsc-headline text-xl text-black">Change your password</div>

          {done && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-900">
              Password changed. You&rsquo;re still signed in here, and anywhere
              else you&rsquo;re signed in stays signed in too.
            </div>
          )}

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">Current password</div>
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="w-full h-11 px-3 bg-white rounded-xl text-black"
            />
          </label>

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">New password</div>
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="w-full h-11 px-3 bg-white rounded-xl text-black"
            />
            <div
              className={`text-xs mt-1 ${tooShort ? 'text-red-700' : 'text-black/40'}`}
            >
              At least {MIN_LEN} characters. A short phrase you&rsquo;ll remember beats
              a scrambled word.
            </div>
          </label>

          <label className="block">
            <div className="dsc-label text-black/50 mb-1">New password again</div>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full h-11 px-3 bg-white rounded-xl text-black"
            />
            {mismatch && (
              <div className="text-xs text-red-700 mt-1">
                These two don&rsquo;t match.
              </div>
            )}
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="w-4 h-4 accent-black"
            />
            <span className="dsc-label text-black/50">Show passwords</span>
          </label>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full h-12 bg-black text-white rounded-full dsc-headline text-base disabled:bg-black/20"
          >
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>

        {me?.role === 'ADMIN' && (
          <StaffResetPanel staff={staff.filter((s) => s.id !== me.userId)} />
        )}
      </div>
    </div>
  )
}

/**
 * Reset someone else's password.
 *
 * Kept visually quieter than your own password form: it's the rarer action and
 * the more powerful one. The new password is shown back once so the admin can
 * pass it on — there's no email delivery for staff credentials.
 */
function StaffResetPanel({ staff }: { staff: Staff[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneFor, setDoneFor] = useState<{ name: string; password: string } | null>(null)

  async function reset(id: string, name: string) {
    setError(null)
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/staff/${id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pw }),
      })
      const d = await r.json()
      if (!d.success) {
        setError(d.error ?? 'Could not reset that password.')
        return
      }
      setDoneFor({ name, password: pw })
      setOpenId(null)
      setPw('')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8">
      <div className="dsc-label text-black/40 mb-2">Reset someone else&rsquo;s password</div>

      {doneFor && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 mb-3">
          <div className="font-semibold mb-1">{doneFor.name}&rsquo;s password is now:</div>
          <div className="font-mono text-base text-black break-all">{doneFor.password}</div>
          <div className="mt-2">
            Give it to them directly. This is the only time it&rsquo;s shown, and
            they should change it themselves on this page afterwards.
          </div>
          <button
            onClick={() => setDoneFor(null)}
            className="mt-2 underline underline-offset-2 font-semibold"
          >
            Done
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 mb-3">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {staff.map((s) => (
          <div key={s.id} className="rounded-2xl bg-black/[0.04] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-black truncate">{s.name}</div>
                <div className="font-mono text-xs text-black/50 truncate">{s.email}</div>
              </div>
              <button
                onClick={() => {
                  setOpenId(openId === s.id ? null : s.id)
                  setPw('')
                  setError(null)
                }}
                className="dsc-label text-black/50 hover:text-black shrink-0"
              >
                {openId === s.id ? 'Cancel' : 'Reset'}
              </button>
            </div>

            {openId === s.id && (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder={`New password for ${s.name}`}
                  autoComplete="off"
                  className="flex-1 h-11 px-3 bg-white rounded-xl text-black placeholder:text-black/30"
                />
                <button
                  onClick={() => reset(s.id, s.name)}
                  disabled={saving || pw.length < MIN_LEN}
                  className="h-11 px-5 bg-black text-white rounded-full font-semibold text-sm disabled:bg-black/20 shrink-0"
                >
                  {saving ? 'Saving…' : 'Set it'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
