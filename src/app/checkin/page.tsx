'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

type View = 'landing' | 'register' | 'login'
type CheckinState = 'input' | 'loading' | 'waiver' | 'success' | 'no-session' | 'walk-in' | 'error'
type RegisterState = 'input' | 'loading' | 'success' | 'error'

interface CheckinData {
  athlete?: {
    firstName: string
    lastName: string
  }
  trainer?: {
    name: string
  }
  session?: {
    scheduledAt: string
    duration: number
  } | null
  nextSession?: {
    scheduledAt: string
  } | null
  walkIn?: {
    id: string
    name: string
    time: string
  }
  message: string
}

const WAIVER_TEXT = `This release and waiver of liability, assumption of risk, and indemnity agreement ("Agreement") is in consideration of the Member/Guest being permitted to enter Dallas Sports Collective, LLC facilities, and to use its equipment and machinery in addition to participate in any instruction or training provided by or at Dallas Sports Collective, LLC. The undersigned (Parent/Guardian if the member is under the age of 18) hereby confirms that they are physically fit and able to participate in any training and/or the use of equipment and machinery.

ACTIVITIES
Activities shall include but are not limited to: (a) using of all sports performance equipment; (b) all activities incidental thereto including without limitation, warm-up exercises, warm-down exercises, rest, recovery, training programs, physical fitness regimens, and other activities which the company at which Company equipment and/or property may be used.

RISKS
The risks of engaging in the activities include but are not limited to: (a) contact or collision with other participants, equipment, or property; (b) slipping, falling, and other loss of balance; (c) abnormal blood pressure or respiration, fainting, dizziness, heat stroke, heart attack, physical conditions that could cause death; and (d) aggravation of pre-existing injuries or medical conditions.

FOOD, BEVERAGES & SUPPLEMENTS
The member/Guest is aware that food/beverages/and or supplements are available and may be consumed at Dallas Sports Collective, LLC. The member/Guest is aware that any purchases and consumption are at the sole discretion of each individual member and the member/Guest understands that Dallas Sports Collective, LLC DOES NOT OFFER any medical advice regarding any food/beverages/and or supplements that may be consumed by the member/Guest. The member/Guest understands that Dallas Sports Collective, LLC shall not be responsible for any medical conditions or issues that may arise as a result of any food, beverages and/or supplement consumption while visiting Dallas Sports Collective, LLC. If the member/Guest has any questions regarding the above, it is understood that any questions will be addressed to a certified medical professional.

CONSENT
The Member/Guest acknowledges the contagious nature of the Corona Virus ("COVID-19") and voluntarily assumes the risk that the member/Guest may be exposed to or infected by COVID-19 by visiting Dallas Sports Collective, LLC; and that such exposure may result in personal injury, illness, permanent disability or death. The Member/Guest understands that the risk of becoming exposed to or infected by COVID-19 at Dallas Sports Collective, LLC may result from the actions, omissions, or negligence of any staff member and/or any third party including, but not limited to members and guests at Dallas Sports Collective, LLC. I voluntarily agree to assume all of the foregoing risks and accept sole responsibility for any injury, illness, permanent disability, death, damage, loss, claim, liability, or expense of any kind, (including medical and legal costs) that I may experience or incur in connection with activities at Dallas Sports Collective.

MEDICAL CONDITIONS
Dallas Sports Collective, LLC, any staff member or agent does not provide medical advice. Depending on your individual physical condition, any instruction, advice, or direction of such parties could result in harm. You should consult your physician or medical doctor before starting a training regimen and prior to the use of any equipment or services. You are solely responsible for all decisions involving any medical treatment or advice of any kind. You assume the risk and release Dallas Sports Collective, LLC, any staff or agent from any liability associated with instruction, advice, or direction that results in harm to you.

I have read and fully understand the terms of this Agreement and understand that I am giving up legal rights by signing this Agreement. I acknowledge that I am signing this agreement freely and voluntarily without any inducement, assurance, or guarantee being made to me and intend my signature to be complete and unconditional release of all liability to the greatest extent allowed by law.`

export default function CheckinPage() {
  // View state
  const [view, setView] = useState<View>('landing')

  // Sign-in state
  const [email, setEmail] = useState('')
  const [state, setState] = useState<CheckinState>('input')
  const [data, setData] = useState<CheckinData | null>(null)
  const [error, setError] = useState('')
  const [legalName, setLegalName] = useState('')
  const [waiverAgreed, setWaiverAgreed] = useState(false)
  const [waiverLoading, setWaiverLoading] = useState(false)
  const waiverScrollRef = useRef<HTMLDivElement>(null)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)

  // Register state
  const [registerState, setRegisterState] = useState<RegisterState>('input')
  const [registerError, setRegisterError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [registerLegalName, setRegisterLegalName] = useState('')
  const [registerWaiverAgreed, setRegisterWaiverAgreed] = useState(false)
  const registerWaiverScrollRef = useRef<HTMLDivElement>(null)
  const [registerHasScrolledToBottom, setRegisterHasScrolledToBottom] = useState(false)
  const [showWaiver, setShowWaiver] = useState(false)

  // Auto-reset after success/error for sign-in
  useEffect(() => {
    if (state === 'success' || state === 'no-session' || state === 'walk-in') {
      const timer = setTimeout(() => {
        setState('input')
        setEmail('')
        setData(null)
        setLegalName('')
        setWaiverAgreed(false)
        setHasScrolledToBottom(false)
        setView('landing')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [state])

  // Auto-reset after success for register
  useEffect(() => {
    if (registerState === 'success') {
      const timer = setTimeout(() => {
        setRegisterState('input')
        setFirstName('')
        setLastName('')
        setRegisterEmail('')
        setPassword('')
        setConfirmPassword('')
        setRegisterLegalName('')
        setRegisterWaiverAgreed(false)
        setRegisterHasScrolledToBottom(false)
        setShowWaiver(false)
        setView('landing')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [registerState])

  // Track scroll position in waiver
  const handleWaiverScroll = () => {
    if (waiverScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = waiverScrollRef.current
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setHasScrolledToBottom(true)
      }
    }
  }

  const handleRegisterWaiverScroll = () => {
    if (registerWaiverScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = registerWaiverScrollRef.current
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setRegisterHasScrolledToBottom(true)
      }
    }
  }

  // Sign-in handlers
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setState('loading')
    setError('')

    try {
      // Check if waiver is already signed
      const waiverRes = await fetch('/api/waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), action: 'check' }),
      })

      const waiverResult = await waiverRes.json()

      if (waiverResult.success && waiverResult.signed) {
        // Waiver already signed, proceed with check-in
        await performCheckin()
      } else {
        // Show waiver modal
        setState('waiver')
      }
    } catch {
      setError('An error occurred')
      setState('error')
    }
  }

  async function handleWaiverSign() {
    if (!waiverAgreed || !legalName.trim()) return

    setWaiverLoading(true)
    try {
      // Sign waiver
      const waiverRes = await fetch('/api/waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          legalName: legalName.trim(),
          action: 'sign',
        }),
      })

      const waiverResult = await waiverRes.json()

      if (!waiverResult.success) {
        setError(waiverResult.error || 'Failed to sign waiver')
        setState('error')
        return
      }

      // Proceed with check-in
      await performCheckin()
    } catch {
      setError('An error occurred')
      setState('error')
    } finally {
      setWaiverLoading(false)
    }
  }

  async function performCheckin() {
    setState('loading')

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || 'Check-in failed')
        setState('error')
        return
      }

      // Handle walk-in response
      if (result.isWalkIn) {
        setData({ walkIn: result.data.walkIn, message: result.message })
        setState('walk-in')
        return
      }

      setData({ ...result.data, message: result.message })
      setState(result.data.matched ? 'success' : 'no-session')
    } catch {
      setError('An error occurred')
      setState('error')
    }
  }

  function handleReset() {
    setState('input')
    setEmail('')
    setData(null)
    setError('')
    setLegalName('')
    setWaiverAgreed(false)
    setHasScrolledToBottom(false)
  }

  // Register handlers
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    // Validate
    if (!firstName.trim() || !lastName.trim()) {
      setRegisterError('First and last name are required')
      return
    }
    if (!registerEmail.trim()) {
      setRegisterError('Email is required')
      return
    }
    if (!password || password.length < 6) {
      setRegisterError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setRegisterError('Passwords do not match')
      return
    }
    if (!registerWaiverAgreed || !registerLegalName.trim()) {
      setRegisterError('You must agree to the waiver and enter your legal name')
      return
    }

    setRegisterState('loading')
    setRegisterError('')

    try {
      const res = await fetch('/api/athletes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: registerEmail.trim(),
          password,
          legalName: registerLegalName.trim(),
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setRegisterError(result.error || 'Registration failed')
        setRegisterState('error')
        return
      }

      setRegisterState('success')
    } catch {
      setRegisterError('An error occurred')
      setRegisterState('error')
    }
  }

  function handleRegisterReset() {
    setRegisterState('input')
    setRegisterError('')
    setShowWaiver(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white p-5">
      {/* Inset container for background image */}
      <div className="flex-1 flex flex-col relative rounded-lg overflow-hidden">
        {/* Full-screen Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/checkin-bg-flip.jpg"
            alt="Gym"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Logo Block - Top Left */}
        <div className="absolute top-6 left-6 z-20">
          <Image
            src="/logo-block.png"
            alt="DSC"
            width={60}
            height={60}
          />
        </div>

      {/* Main Content */}
      <main className="flex-1 relative z-10">

        {/* LANDING VIEW */}
        {view === 'landing' && (
          <div className="absolute left-[150px] bottom-[150px]">
            <button
              onClick={() => setView('register')}
              className="group flex items-center gap-3 mb-4 text-left"
            >
              <span className="text-white text-[64px] font-extrabold tracking-tight drop-shadow-lg" style={{ fontFamily: 'var(--font-avenir), system-ui, sans-serif' }}>
                NEW ATHLETE REGISTRATION
              </span>
              <span className="text-white text-5xl font-light opacity-80 group-hover:translate-x-2 transition-transform">&#9735;</span>
            </button>

            <button
              onClick={() => setView('login')}
              className="group flex items-center gap-3 text-left"
            >
              <span className="text-white text-[64px] font-extrabold tracking-tight drop-shadow-lg" style={{ fontFamily: 'var(--font-avenir), system-ui, sans-serif' }}>
                ATHLETE LOGIN
              </span>
              <span className="text-white text-5xl font-light opacity-80 group-hover:translate-x-2 transition-transform">&#9735;</span>
            </button>
          </div>
        )}

        {/* REGISTER VIEW */}
        {view === 'register' && registerState === 'input' && !showWaiver && (
          <div className="absolute left-[150px] bottom-[150px] max-w-2xl">
            <button
              onClick={() => setView('landing')}
              className="group flex items-center gap-3 mb-8 text-left"
            >
              <span className="text-white text-[48px] font-extrabold tracking-tight drop-shadow-lg" style={{ fontFamily: 'var(--font-avenir), system-ui, sans-serif' }}>
                JOIN THE DALLAS SPORT COLLECTIVE
              </span>
              <span className="text-white text-4xl font-light opacity-80 rotate-180 group-hover:-translate-x-2 transition-transform">&#9735;</span>
            </button>

            <div className="bg-white/90 backdrop-blur rounded-2xl p-6 md:p-8 shadow-2xl">
              <p className="font-bold text-sm md:text-base mb-4 text-black">
                WELCOME! THIS IS THE DALLAS SPORT COLLECTIVE AI POWERED GYM APP. LET&apos;S GET A LITTLE INFO FROM YOU BEFORE YOU JOIN.
              </p>

              <form onSubmit={(e) => { e.preventDefault(); setRegisterError(''); setShowWaiver(true); }} className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="FIRST NAME"
                    className="flex-1 px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="LAST NAME"
                    className="flex-1 px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                  />
                </div>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="EMAIL"
                  className="w-full px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="PASSWORD"
                  className="w-full px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="CONFIRM PASSWORD"
                  className="w-full px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                />
                {registerError && (
                  <p className="text-red-500 text-sm text-center">{registerError}</p>
                )}
                <button
                  type="submit"
                  className="w-full px-6 py-3 text-base font-bold bg-black text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                  CONTINUE TO WAIVER
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Register Loading */}
        {registerState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/70 backdrop-blur rounded-2xl p-8">
              <div className="text-white text-xl mb-4">Creating your account...</div>
              <div className="animate-pulse text-white text-4xl">...</div>
            </div>
          </div>
        )}

        {/* Register Success */}
        {registerState === 'success' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-green-400">&#10003;</div>
              <h2 className="text-3xl font-black text-white">
                Welcome, {firstName}!
              </h2>
              <div className="bg-green-500/20 rounded-lg p-4">
                <p className="text-xl text-white">Registration complete!</p>
                <p className="text-gray-300 mt-2">
                  You can now sign in with your email
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Register Error */}
        {registerState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-red-500">!</div>
              <p className="text-xl text-red-400">{registerError}</p>
              <button
                onClick={handleRegisterReset}
                className="px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-100"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* LOGIN VIEW */}
        {view === 'login' && state === 'input' && (
          <div className="absolute left-[150px] bottom-[150px] max-w-2xl">
            <button
              onClick={() => setView('landing')}
              className="group flex items-center gap-3 mb-8 text-left"
            >
              <span className="text-white text-[48px] font-extrabold tracking-tight drop-shadow-lg" style={{ fontFamily: 'var(--font-avenir), system-ui, sans-serif' }}>
                ATHLETE LOGIN
              </span>
              <span className="text-white text-4xl font-light opacity-80 rotate-180 group-hover:-translate-x-2 transition-transform">&#9735;</span>
            </button>

            <div className="bg-white/90 backdrop-blur rounded-2xl p-6 md:p-8 shadow-2xl">
              <p className="font-bold text-sm md:text-base mb-4 text-black">
                SIGN IN BEFORE YOUR SESSION BEGINS
              </p>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ENTER EMAIL"
                  className="w-full px-4 py-3 text-base font-medium text-center bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400"
                  autoFocus
                />
                {error && (
                  <p className="text-red-500 text-sm text-center">{error}</p>
                )}
                <button
                  type="submit"
                  className="w-full px-6 py-3 text-base font-bold bg-black text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                  SIGN IN
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Login Loading */}
        {view === 'login' && state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/70 backdrop-blur rounded-2xl p-8">
              <div className="text-white text-xl mb-4">Finding your session...</div>
              <div className="animate-pulse text-white text-4xl">...</div>
            </div>
          </div>
        )}

        {/* Login Success */}
        {view === 'login' && state === 'success' && data && data.athlete && data.trainer && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-green-400">&#10003;</div>
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.athlete.firstName}!
              </h2>
              <div className="bg-white/10 rounded-lg p-4 space-y-2">
                <p className="text-xl text-white">Trainer: {data.trainer.name}</p>
                {data.session && (
                  <p className="text-lg text-gray-300">
                    Session at{' '}
                    {new Date(data.session.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          </div>
        )}

        {/* Login No Session */}
        {view === 'login' && state === 'no-session' && data && data.athlete && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.athlete.firstName}!
              </h2>
              <div className="bg-yellow-500/20 rounded-lg p-4">
                <p className="text-xl text-white">No session scheduled for today</p>
                {data.nextSession && (
                  <p className="text-gray-300 mt-2">
                    Next session:{' '}
                    {new Date(data.nextSession.scheduledAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          </div>
        )}

        {/* Login Walk-in */}
        {view === 'login' && state === 'walk-in' && data && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl">&#128075;</div>
              <h2 className="text-3xl font-black text-white">
                Welcome, {data.walkIn?.name}!
              </h2>
              <div className="bg-blue-500/20 rounded-lg p-4">
                <p className="text-xl text-white">You&apos;ve been checked in as a walk-in</p>
                <p className="text-gray-300 mt-2">
                  Please speak with a trainer to get set up with an account
                </p>
              </div>
              <button
                onClick={handleReset}
                className="text-white/70 underline text-sm hover:text-white"
              >
                Check in another person
              </button>
            </div>
          </div>
        )}

        {/* Login Error */}
        {view === 'login' && state === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/80 backdrop-blur rounded-2xl p-8 space-y-4 max-w-md">
              <div className="text-6xl text-red-500">!</div>
              <p className="text-xl text-red-400">{error}</p>
              <button
                onClick={() => { handleReset(); setView('login'); }}
                className="px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-100"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Bottom Tagline - inside the image area */}
        <div className="absolute bottom-6 left-0 right-0 z-10">
          <p className="text-white text-center text-lg md:text-xl font-light tracking-[0.3em] uppercase drop-shadow-lg">
            Unlock Your Peak Performance
          </p>
        </div>
      </main>
      </div>

      {/* Footer - outside the inset image */}
      <footer className="bg-white py-4 px-8">
        <p className="text-gray-500 text-xs text-center">
          Copyright &copy; 2025 Dallas Sports Collective. All Rights Reserved.
        </p>
      </footer>

      {/* Sign-in Waiver Modal */}
      {state === 'waiver' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-black text-center">
                ACCIDENT WAIVER AND RELEASE OF LIABILITY
              </h2>
              <p className="text-center text-gray-600 mt-1">
                Dallas Sports Collective, LLC
              </p>
            </div>

            {/* Waiver Content */}
            <div
              ref={waiverScrollRef}
              onScroll={handleWaiverScroll}
              className="flex-1 overflow-y-auto p-6 text-sm text-gray-700 leading-relaxed"
            >
              {/* Legal Name Input at Top */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  FULL LEGAL NAME
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Enter your full legal name"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              {/* Waiver Text */}
              <div className="whitespace-pre-wrap">
                {WAIVER_TEXT}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 space-y-4">
              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiverAgreed}
                  onChange={(e) => setWaiverAgreed(e.target.checked)}
                  disabled={!hasScrolledToBottom}
                  className="mt-1 w-5 h-5 accent-black disabled:opacity-50"
                />
                <span className={`text-sm ${!hasScrolledToBottom ? 'text-gray-400' : 'text-gray-700'}`}>
                  {!hasScrolledToBottom
                    ? 'Please scroll to the bottom to read the entire waiver'
                    : 'I have read and fully understand the terms of this Agreement and understand that I am giving up legal rights by signing this Agreement.'}
                </span>
              </label>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-full font-bold hover:bg-gray-50 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleWaiverSign}
                  disabled={!waiverAgreed || !legalName.trim() || waiverLoading}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-full font-bold hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {waiverLoading ? 'SIGNING...' : 'SIGN AND SUBMIT'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register Waiver Modal */}
      {showWaiver && registerState === 'input' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-black text-center">
                ACCIDENT WAIVER AND RELEASE OF LIABILITY
              </h2>
              <p className="text-center text-gray-600 mt-1">
                Dallas Sports Collective, LLC
              </p>
            </div>

            {/* Waiver Content */}
            <div
              ref={registerWaiverScrollRef}
              onScroll={handleRegisterWaiverScroll}
              className="flex-1 overflow-y-auto p-6 text-sm text-gray-700 leading-relaxed"
            >
              {/* Legal Name Input at Top */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  FULL LEGAL NAME
                </label>
                <input
                  type="text"
                  value={registerLegalName}
                  onChange={(e) => setRegisterLegalName(e.target.value)}
                  placeholder="Enter your full legal name"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              {/* Waiver Text */}
              <div className="whitespace-pre-wrap">
                {WAIVER_TEXT}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 space-y-4">
              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registerWaiverAgreed}
                  onChange={(e) => setRegisterWaiverAgreed(e.target.checked)}
                  disabled={!registerHasScrolledToBottom}
                  className="mt-1 w-5 h-5 accent-black disabled:opacity-50"
                />
                <span className={`text-sm ${!registerHasScrolledToBottom ? 'text-gray-400' : 'text-gray-700'}`}>
                  {!registerHasScrolledToBottom
                    ? 'Please scroll to the bottom to read the entire waiver'
                    : 'I have read and fully understand the terms of this Agreement and understand that I am giving up legal rights by signing this Agreement.'}
                </span>
              </label>

              {registerError && (
                <p className="text-red-500 text-sm text-center">{registerError}</p>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWaiver(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-full font-bold hover:bg-gray-50 transition-colors"
                >
                  BACK
                </button>
                <button
                  onClick={handleRegister}
                  disabled={!registerWaiverAgreed || !registerLegalName.trim()}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-full font-bold hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  REGISTER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
