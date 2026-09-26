'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface StaffUser {
  name: string
  role: 'ADMIN' | 'TRAINER'
  trainerId?: string
}

/** The signed-in staff member; sends anyone else to login. */
export function useStaff(): StaffUser | null {
  const router = useRouter()
  const [user, setUser] = useState<StaffUser | null>(null)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) router.replace('/login')
        else setUser(d.user)
      })
      .catch(() => router.replace('/login'))
  }, [router])
  return user
}

export function homeFor(user: StaffUser | null): string {
  return user?.role === 'ADMIN' ? '/admin' : '/trainer'
}
