'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

function HeaderLogo() {
  return (
    <Link href="/athlete" aria-label="DSC home" className="block">
      <Image src="/logo-mark.png" alt="DSC" width={40} height={40} priority />
    </Link>
  )
}

export default function AthleteRegister() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    legalName: '',
    agreed: false,
  })
  const [showWaiver, setShowWaiver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    email: string
    verificationUrl: string | null
    emailDelivered: boolean
  } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.agreed) {
      setError('Please agree to the waiver before continuing.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/athletes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          legalName: formData.legalName || `${formData.firstName} ${formData.lastName}`,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess({
          email: data.data.email,
          verificationUrl: data.verificationUrl,
          emailDelivered: data.emailDelivered,
        })
      } else {
        setError(data.error || 'Registration failed')
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="px-4 py-5">
          <Link href="/athlete" className="dsc-headline text-2xl text-black">
            DSC
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full">
            <div className="dsc-label text-black/40 mb-2">Almost done</div>
            <h2 className="dsc-headline text-3xl md:text-4xl text-black mb-4">
              Check your email
            </h2>
            <p className="text-black/70 mb-6 leading-snug">
              We sent a confirmation link to{' '}
              <span className="font-semibold text-black">{success.email}</span>.
              Click it to activate your account, then sign in.
            </p>

            {!success.emailDelivered && success.verificationUrl && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 mb-6">
                <div className="dsc-label text-yellow-900 mb-1">
                  Dev mode — no email service configured
                </div>
                <p className="text-sm text-yellow-900 mb-2">
                  Use this link directly to verify:
                </p>
                <a
                  href={success.verificationUrl}
                  className="text-sm text-blue-700 underline break-all"
                >
                  {success.verificationUrl}
                </a>
              </div>
            )}

            <Link
              href="/athlete/login"
              className="block w-full text-center py-3 bg-black text-white rounded-full font-semibold"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 py-5 flex items-center justify-between">
        <HeaderLogo />
        <Link href="/athlete/login" className="dsc-label text-black/60 hover:text-black">
          Sign in
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-6 py-4">
        <div className="w-full max-w-md">
          <div className="dsc-label text-black/40 mb-2">New athlete</div>
          <h2 className="dsc-headline text-3xl md:text-4xl text-black mb-6">
            Register
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                value={formData.firstName}
                onChange={(v) => setFormData({ ...formData, firstName: v })}
                required
              />
              <Field
                label="Last name"
                value={formData.lastName}
                onChange={(v) => setFormData({ ...formData, lastName: v })}
                required
              />
            </div>
            <Field
              label="Email"
              type="email"
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
              required
            />
            <Field
              label="Password"
              type="password"
              value={formData.password}
              onChange={(v) => setFormData({ ...formData, password: v })}
              hint="At least 6 characters"
              required
            />
            <Field
              label="Legal name (for waiver)"
              value={formData.legalName}
              onChange={(v) => setFormData({ ...formData, legalName: v })}
              placeholder={`${formData.firstName} ${formData.lastName}`.trim() || 'Same as above'}
            />

            <label className="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                checked={formData.agreed}
                onChange={(e) =>
                  setFormData({ ...formData, agreed: e.target.checked })
                }
                className="mt-1 w-5 h-5 accent-black"
              />
              <span className="text-sm text-black/80 leading-snug">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={() => setShowWaiver(true)}
                  className="underline text-black"
                >
                  waiver and disclaimer
                </button>
                .
              </span>
            </label>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-black text-white rounded-full font-semibold disabled:bg-black/30"
            >
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>

      {showWaiver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-white max-w-lg w-full max-h-[80vh] overflow-y-auto rounded-2xl p-6">
            <h3 className="dsc-headline text-xl text-black mb-4">
              Waiver and disclaimer
            </h3>
            <div className="text-sm text-black/80 space-y-3 mb-6">
              <p>
                By registering, I acknowledge that physical training involves
                inherent risks. I voluntarily assume those risks.
              </p>
              <p>
                I confirm I am in good physical condition and have no medical
                conditions that prevent participation. I will inform my trainer
                of any limitations.
              </p>
              <p>
                I release DSC, its owners, trainers, employees, and agents from
                liability for any injury or damage from training activities.
              </p>
              <p>
                In an emergency, I authorize DSC staff to seek medical
                treatment on my behalf.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setFormData({ ...formData, agreed: true })
                  setShowWaiver(false)
                }}
                className="flex-1 h-11 bg-black text-white rounded-full font-semibold"
              >
                I agree
              </button>
              <button
                onClick={() => setShowWaiver(false)}
                className="flex-1 h-11 border border-black/20 text-black rounded-full font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <div className="dsc-label text-black/50 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-11 px-4 bg-black/5 rounded-xl text-[15px] text-black placeholder:text-black/40 focus:outline-none focus:bg-black/[0.07]"
      />
      {hint && <div className="text-xs text-black/40 mt-1">{hint}</div>}
    </label>
  )
}
