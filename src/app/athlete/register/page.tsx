'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AthleteRegister() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    address: '',
    agreedToDisclaimer: false,
  })
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.agreedToDisclaimer) {
      setError('Please read and agree to the disclaimer')
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
          address: formData.address,
        }),
      })

      const data = await res.json()

      if (data.success) {
        router.push('/athlete/login?registered=true')
      } else {
        setError(data.error || 'Registration failed')
      }
    } catch {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="pt-8 pb-4 text-center">
        <Link href="/athlete">
          <h1 className="text-3xl font-bold tracking-widest">DSC</h1>
        </Link>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-8 tracking-wide">
            NEW ATHLETE REGISTRATION
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 tracking-wide">
                FIRST NAME
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/30 text-white placeholder-white/50 focus:border-white focus:outline-none"
                placeholder="Enter your first name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 tracking-wide">
                LAST NAME
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/30 text-white placeholder-white/50 focus:border-white focus:outline-none"
                placeholder="Enter your last name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 tracking-wide">
                ADDRESS
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/30 text-white placeholder-white/50 focus:border-white focus:outline-none"
                placeholder="Enter your address"
              />
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="disclaimer"
                checked={formData.agreedToDisclaimer}
                onChange={(e) => setFormData({ ...formData, agreedToDisclaimer: e.target.checked })}
                className="mt-1 w-5 h-5 accent-white"
              />
              <label htmlFor="disclaimer" className="text-sm">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={() => setShowDisclaimer(true)}
                  className="underline hover:text-gray-300"
                >
                  waiver and disclaimer
                </button>
              </label>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-white text-black font-semibold text-lg tracking-wide hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {loading ? 'REGISTERING...' : 'REGISTER'}
            </button>
          </form>

          <p className="text-center mt-6 text-white/60 text-sm">
            Already registered?{' '}
            <Link href="/athlete/login" className="underline hover:text-white">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-white text-black max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">WAIVER AND DISCLAIMER</h3>

            <div className="text-sm space-y-4 mb-6">
              <p>
                By signing up for training services at DSport Collective (DSC), I acknowledge
                and agree to the following:
              </p>

              <p>
                <strong>Assumption of Risk:</strong> I understand that physical training and
                exercise involve inherent risks, including but not limited to, physical injury,
                disability, or death. I voluntarily assume all such risks.
              </p>

              <p>
                <strong>Health Declaration:</strong> I confirm that I am in good physical
                condition and have no medical conditions that would prevent my participation
                in physical training activities. I agree to inform my trainer of any health
                conditions or limitations.
              </p>

              <p>
                <strong>Release of Liability:</strong> I hereby release, waive, and discharge
                DSport Collective, its owners, trainers, employees, and agents from any and
                all liability for any injury or damage that may result from my participation
                in training activities.
              </p>

              <p>
                <strong>Emergency Medical Treatment:</strong> In the event of an emergency, I
                authorize DSport Collective staff to seek medical treatment on my behalf.
              </p>

              <p>
                <strong>Personal Property:</strong> I understand that DSport Collective is
                not responsible for any personal property lost, stolen, or damaged on the
                premises.
              </p>

              <p>
                I have read this waiver and disclaimer, understand its terms, and sign it
                voluntarily.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setFormData({ ...formData, agreedToDisclaimer: true })
                  setShowDisclaimer(false)
                }}
                className="flex-1 py-3 bg-black text-white font-semibold hover:bg-gray-800 transition-colors"
              >
                I AGREE
              </button>
              <button
                onClick={() => setShowDisclaimer(false)}
                className="flex-1 py-3 border border-black text-black font-semibold hover:bg-gray-100 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
