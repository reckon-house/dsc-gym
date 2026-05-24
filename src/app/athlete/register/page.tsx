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
          <HeaderLogo />
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full">
            <div className="dsc-enter">
              <div className="dsc-label text-black/40 mb-2">Almost done</div>
              <h2 className="dsc-headline text-3xl md:text-4xl text-black mb-4">
                Check your email
              </h2>
              <p className="text-black/70 mb-6 leading-snug">
                We sent a confirmation link to{' '}
                <span className="font-semibold text-black">{success.email}</span>.
                Click it to activate your account, then sign in.
              </p>
            </div>

            {!success.emailDelivered && success.verificationUrl && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 mb-6 dsc-enter-delay-1">
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
              className="block w-full text-center py-3 bg-black text-white rounded-full font-semibold dsc-enter-delay-2"
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

      <div className="flex-1 flex items-stretch px-4 pb-4">
        <div
          className="relative w-full rounded-3xl overflow-hidden flex flex-col justify-end dsc-image-enter"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '85vh',
          }}
        >
          {/* Stronger bottom gradient — register form is taller than login */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none" />

          <div className="relative p-6 pb-8 space-y-5">
            <div className="dsc-enter">
              <div className="dsc-label text-white/70 mb-2">New athlete</div>
              <h2 className="dsc-headline text-4xl md:text-6xl text-white leading-[0.85]">
                Join the
                <br />
                collective.
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2 dsc-enter-delay-1">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  placeholder="First name"
                  className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
                />
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                  placeholder="Last name"
                  className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
                />
              </div>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                autoComplete="email"
                placeholder="Email"
                className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                autoComplete="new-password"
                placeholder="Password (6+ characters)"
                className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              <input
                type="text"
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                placeholder={
                  `${formData.firstName} ${formData.lastName}`.trim() ||
                  'Legal name for waiver'
                }
                className="w-full h-14 px-6 bg-white text-black text-base rounded-full placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-white/60"
              />

              <label className="flex items-start gap-3 pt-2 px-1">
                <input
                  type="checkbox"
                  checked={formData.agreed}
                  onChange={(e) =>
                    setFormData({ ...formData, agreed: e.target.checked })
                  }
                  className="mt-1 w-5 h-5 accent-white shrink-0"
                />
                <span className="text-sm text-white/85 leading-snug">
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowWaiver(true)}
                    className="underline text-white"
                  >
                    waiver and disclaimer
                  </button>
                  .
                </span>
              </label>

              {error && (
                <div className="rounded-2xl bg-red-500/20 border border-red-300/40 text-red-100 px-4 py-2 text-sm backdrop-blur">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-black text-white rounded-full dsc-headline text-lg disabled:bg-black/40 mt-3"
              >
                {loading ? 'CREATING…' : 'CREATE ACCOUNT'}
              </button>
            </form>
          </div>
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
