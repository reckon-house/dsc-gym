'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function AthleteLanding() {
  return (
    <div className="min-h-screen bg-white flex flex-col w-full max-w-5xl mx-auto">
      <header className="px-4 md:px-6 py-5 flex items-center justify-between">
        <Link href="/athlete" aria-label="DSC home" className="block">
          <Image
            src="/logo-mark.png"
            alt="DSC"
            width={40}
            height={40}
            priority
          />
        </Link>
        <Link href="/login" className="dsc-label text-black/50 hover:text-black">
          Staff login
        </Link>
      </header>

      <div className="flex-1 flex items-stretch px-4 md:px-6 pb-4">
        <div
          className="relative w-full rounded-3xl overflow-hidden flex flex-col justify-end dsc-image-enter"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '60vh',
          }}
        >
          {/* Bottom gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

          <div className="relative p-6 pb-8 md:p-10 md:pb-10">
            <div className="w-full max-w-md space-y-6">
              <div className="dsc-enter">
                <div className="dsc-label text-white/70 mb-2">
                  Dallas Sports Collective
                </div>
                <h1 className="dsc-headline text-4xl md:text-6xl text-white leading-[0.85] mb-2">
                  Unlock your
                  <br />
                  peak.
                </h1>
              </div>

              <div className="space-y-2 dsc-enter-delay-1">
                <Link
                  href="/athlete/login"
                  className="block w-full bg-white text-black py-4 rounded-full text-center dsc-headline text-lg"
                >
                  Sign in
                </Link>
                <Link
                  href="/athlete/register"
                  className="block w-full border-2 border-white/80 text-white py-4 rounded-full text-center dsc-headline text-lg"
                >
                  New here? Register
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
