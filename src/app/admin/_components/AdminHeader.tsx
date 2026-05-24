'use client'

import Link from 'next/link'

interface Props {
  title: string
}

export function AdminHeader({ title }: Props) {
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-b border-black/10">
      <Link
        href="/admin"
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-black/70"
        aria-label="Back to home"
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
      <div className="dsc-headline text-lg md:text-xl text-black">{title}</div>
    </header>
  )
}
