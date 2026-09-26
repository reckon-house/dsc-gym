// Which DSC gym something happens at (Celina, McKinney, …).
//
// The list of places is Gym.locationsJson — the same data the public "About"
// section shows — so adding a gym there makes it pickable everywhere. Places
// marked comingSoon are not pickable yet.
//
// Groups carry a location and their sessions inherit it. A session only stores
// its own location when it differs from its group's (or has no group), so
// retagging a group retags its whole schedule without a data migration.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

interface LocationEntry {
  name: string
  comingSoon?: boolean
}

/** Value for "filter to sessions nobody has tagged yet". */
export const NO_LOCATION = 'none'

export async function gymLocations(gymId: string): Promise<string[]> {
  const gym = await db.gym.findUnique({ where: { id: gymId }, select: { locationsJson: true } })
  const raw = Array.isArray(gym?.locationsJson) ? (gym!.locationsJson as unknown as LocationEntry[]) : []
  return raw.filter((l) => l && typeof l.name === 'string' && !l.comingSoon).map((l) => l.name)
}

/**
 * Normalise user input to a known location name. Case-insensitive, and ""
 * or null clears it. Unknown names are an error rather than silently stored,
 * or the calendar filter would grow a "Mckinney" next to "McKinney".
 */
export async function resolveLocation(
  gymId: string,
  raw: unknown
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Location must be a name.' }
  const names = await gymLocations(gymId)
  const hit = names.find((n) => n.toLowerCase() === raw.trim().toLowerCase())
  if (!hit) return { ok: false, error: `Unknown location "${raw}". Options: ${names.join(', ')}.` }
  return { ok: true, value: hit }
}

/** Where a session actually is: its own tag, else its group's. */
export function effectiveLocation(s: {
  location?: string | null
  group?: { location?: string | null } | null
}): string | null {
  return s.location ?? s.group?.location ?? null
}

/** Prisma filter matching sessions at `name` (or untagged, for NO_LOCATION). */
export function sessionLocationWhere(name: string): Prisma.SessionWhereInput {
  if (name === NO_LOCATION) {
    return {
      location: null,
      OR: [{ groupId: null }, { group: { location: null } }],
    }
  }
  return {
    OR: [{ location: name }, { location: null, group: { location: name } }],
  }
}
