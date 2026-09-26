'use client'

import { useEffect, useState } from 'react'

/** Pickable gym locations ("Celina", "McKinney"). Empty until loaded. */
export function useLocations(): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/gym/locations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setNames(d.data)
      })
      .catch(() => {})
  }, [])
  return names
}
