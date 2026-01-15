'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function AthleteLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* White header with logo */}
      <div className="py-4 flex justify-center bg-white">
        <Image
          src="/images/dsc-logo.jpg"
          alt="DSC Logo"
          width={60}
          height={60}
          className="object-contain"
        />
      </div>

      {/* Main content - rounded image container */}
      <div className="flex-1 px-4 pb-4">
        <div
          className="w-full h-full min-h-[70vh] relative rounded-2xl overflow-hidden"
          style={{
            backgroundImage: 'url(/images/landing-page-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Buttons overlaid on the image - positioned in center */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <div className="flex flex-col gap-6 w-full max-w-md">
              <Link
                href="/athlete/login"
                className="text-white font-bold text-2xl md:text-3xl tracking-wider flex items-center gap-3 hover:opacity-80 transition-opacity"
                style={{
                  textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
                  fontStyle: 'italic'
                }}
              >
                ATHLETE LOGIN
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M19 13L13 19M19 13L13 13M19 13L19 19" />
                </svg>
              </Link>

              <Link
                href="/athlete/register"
                className="text-white font-bold text-2xl md:text-3xl tracking-wider hover:opacity-80 transition-opacity"
                style={{
                  textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
                  fontStyle: 'italic'
                }}
              >
                <span className="flex items-center gap-3">
                  NEW ATHLETE
                </span>
                <span className="flex items-center gap-3">
                  REGISTRATION
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M19 13L13 19M19 13L13 13M19 13L19 19" />
                  </svg>
                </span>
              </Link>
            </div>
          </div>

          {/* Bottom tagline bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-white py-4">
            <p className="text-center text-black font-medium tracking-[0.3em] text-sm md:text-base">
              UNLOCK YOUR PEAK PERFORMANCE
            </p>
          </div>
        </div>
      </div>

      {/* Staff login link */}
      <div className="py-3 text-center bg-white">
        <p className="text-gray-500 text-sm">
          Staff? <Link href="/login" className="underline hover:text-black">Login here</Link>
        </p>
      </div>
    </div>
  )
}
