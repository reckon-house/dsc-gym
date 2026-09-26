// Athlete health notes: current injuries, past injuries, physical therapy,
// and conditions (asthma, allergies) a coach should know before a session.
//
// Two audiences can write here — staff, and the athlete's own family — and
// the rules differ only in one place: a family may delete what it wrote, but
// not a note a coach wrote. They can still mark it resolved.

import { db } from '@/lib/db'

export const HEALTH_KINDS = ['injury', 'pt', 'condition'] as const
export type HealthKind = (typeof HEALTH_KINDS)[number]

export interface HealthNoteInput {
  kind?: unknown
  title?: unknown
  details?: unknown
  since?: unknown
  active?: unknown
}

export interface Author {
  role: 'staff' | 'family'
  name: string | null
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function parse(input: HealthNoteInput, partial: boolean) {
  const out: { kind?: HealthKind; title?: string; details?: string | null; since?: string | null; active?: boolean } = {}
  if (input.kind !== undefined || !partial) {
    if (!HEALTH_KINDS.includes(input.kind as HealthKind)) return { error: 'Pick injury, PT or condition.' }
    out.kind = input.kind as HealthKind
  }
  if (input.title !== undefined || !partial) {
    const title = text(input.title, 120)
    if (!title) return { error: 'Say what it is (e.g. "Left ankle sprain").' }
    out.title = title
  }
  if (input.details !== undefined) out.details = text(input.details, 2000)
  if (input.since !== undefined) out.since = text(input.since, 60)
  if (input.active !== undefined) out.active = Boolean(input.active)
  return { data: out }
}

export function listHealthNotes(athleteId: string) {
  return db.healthNote.findMany({
    where: { athleteId },
    orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
  })
}

export async function createHealthNote(athleteId: string, input: HealthNoteInput, by: Author) {
  const p = parse(input, false)
  if ('error' in p) return { ok: false as const, error: p.error! }
  const athlete = await db.athlete.findUnique({ where: { id: athleteId }, select: { gymId: true } })
  if (!athlete) return { ok: false as const, error: 'Athlete not found.' }
  const note = await db.healthNote.create({
    data: {
      gymId: athlete.gymId,
      athleteId,
      kind: p.data.kind!,
      title: p.data.title!,
      details: p.data.details ?? null,
      since: p.data.since ?? null,
      active: p.data.active ?? true,
      createdByRole: by.role,
      createdByName: by.name,
    },
  })
  return { ok: true as const, note }
}

export async function updateHealthNote(athleteId: string, noteId: string, input: HealthNoteInput, by: Author) {
  const existing = await db.healthNote.findUnique({ where: { id: noteId } })
  if (!existing || existing.athleteId !== athleteId) return { ok: false as const, error: 'Note not found.' }
  const p = parse(input, true)
  if ('error' in p) return { ok: false as const, error: p.error! }
  const note = await db.healthNote.update({
    where: { id: noteId },
    data: { ...p.data, updatedByName: by.name },
  })
  return { ok: true as const, note }
}

export async function deleteHealthNote(athleteId: string, noteId: string, by: Author) {
  const existing = await db.healthNote.findUnique({ where: { id: noteId } })
  if (!existing || existing.athleteId !== athleteId) return { ok: false as const, error: 'Note not found.' }
  // Once the PT is involved there's a staff record attached; a family delete
  // would cascade it away. They can still mark it resolved.
  if (by.role === 'family' && existing.ptStatus) {
    return { ok: false as const, error: 'The gym is following up on this one — mark it resolved instead.' }
  }
  if (by.role === 'family' && existing.createdByRole !== 'family') {
    return { ok: false as const, error: 'A coach added this one — mark it resolved instead, or ask the gym to remove it.' }
  }
  await db.healthNote.delete({ where: { id: noteId } })
  return { ok: true as const }
}

/**
 * Active injuries/PT/conditions for a set of athletes, as short labels —
 * what a coach sees next to a name when taking attendance.
 */
export async function activeHealthFlags(athleteIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (athleteIds.length === 0) return out
  const rows = await db.healthNote.findMany({
    where: { athleteId: { in: athleteIds }, active: true },
    select: { athleteId: true, kind: true, title: true },
    orderBy: { updatedAt: 'desc' },
  })
  for (const r of rows) {
    const label = r.kind === 'pt' ? `PT: ${r.title}` : r.title
    ;(out.get(r.athleteId) ?? out.set(r.athleteId, []).get(r.athleteId)!).push(label)
  }
  return out
}

export function serializeHealthNote(n: Awaited<ReturnType<typeof listHealthNotes>>[number]) {
  return {
    id: n.id,
    kind: n.kind as HealthKind,
    title: n.title,
    details: n.details,
    since: n.since,
    active: n.active,
    createdByRole: n.createdByRole as 'staff' | 'family',
    createdByName: n.createdByName,
    updatedByName: n.updatedByName,
    updatedAt: n.updatedAt.toISOString(),
  }
}

/**
 * Staff view: the family fields plus PT follow-up status and thread size.
 * Never use this for the family routes.
 */
export function serializeStaffHealthNote(
  n: Awaited<ReturnType<typeof listHealthNotes>>[number] & { _count?: { comments: number } }
) {
  return {
    ...serializeHealthNote(n),
    ptStatus: n.ptStatus as 'flagged' | 'following' | 'cleared' | null,
    flaggedByName: n.flaggedByName,
    commentCount: n._count?.comments ?? 0,
  }
}
