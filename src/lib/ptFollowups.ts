// Coach ↔ PT injury follow-ups.
//
// Builds on HealthNote (the injury card every athlete already has). A coach
// flags an injury for the PT; the PT sees it in a follow-up list, the two
// talk in a staff-only thread, and the PT clears it — which moves the injury to
// past history and takes the flag off the attendance sheet.
//
// Families never see the thread or the PT status: the family health routes
// serialize without them. They see only "current" or "past".

import { db } from '@/lib/db'

export type PtStatus = 'flagged' | 'following' | 'cleared'

export interface Actor {
  userId: string
  name: string
}

async function isPT(userId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { isPT: true, active: true } })
  return Boolean(u?.isPT && u.active)
}

export async function ptUsers() {
  return db.user.findMany({ where: { isPT: true, active: true }, select: { id: true, name: true, email: true } })
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function flagForPT(noteId: string, by: Actor, message?: unknown) {
  const note = await db.healthNote.findUnique({ where: { id: noteId } })
  if (!note) return { ok: false as const, error: 'Injury not found.' }
  if (note.ptStatus === 'flagged' || note.ptStatus === 'following') {
    return { ok: false as const, error: 'Already with the PT.' }
  }
  const body = clean(message, 2000)
  await db.$transaction([
    db.healthNote.update({
      where: { id: noteId },
      data: {
        ptStatus: 'flagged',
        active: true,
        flaggedAt: new Date(),
        flaggedById: by.userId,
        flaggedByName: by.name,
        clearedAt: null,
        clearedByName: null,
      },
    }),
    ...(body ? [db.healthNoteComment.create({ data: { noteId, body, byUserId: by.userId, byName: by.name } })] : []),
  ])
  return { ok: true as const }
}

/** A coach reporting a new injury, optionally flagged for the PT in one step. */
export async function reportInjury(
  input: { athleteId: unknown; title: unknown; details?: unknown; flag?: unknown; message?: unknown },
  by: Actor
) {
  const athleteId = typeof input.athleteId === 'string' ? input.athleteId : ''
  const athlete = await db.athlete.findUnique({ where: { id: athleteId }, select: { id: true, gymId: true, archived: true } })
  if (!athlete || athlete.archived) return { ok: false as const, error: 'Pick an athlete.' }
  const title = clean(input.title, 120)
  if (!title) return { ok: false as const, error: 'Say what happened, e.g. "Rolled left ankle".' }
  const note = await db.healthNote.create({
    data: {
      gymId: athlete.gymId,
      athleteId,
      kind: 'injury',
      title,
      details: clean(input.details, 2000),
      since: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      active: true,
      createdByRole: 'staff',
      createdByName: by.name,
    },
  })
  if (input.flag !== false) {
    const f = await flagForPT(note.id, by, input.message)
    if (!f.ok) return f
  }
  return { ok: true as const, noteId: note.id }
}

export async function addComment(noteId: string, body: unknown, by: Actor) {
  const note = await db.healthNote.findUnique({ where: { id: noteId } })
  if (!note) return { ok: false as const, error: 'Injury not found.' }
  const text = clean(body, 2000)
  if (!text) return { ok: false as const, error: 'Write something first.' }
  const comment = await db.healthNoteComment.create({ data: { noteId, body: text, byUserId: by.userId, byName: by.name } })
  // The PT replying to a new flag means they've picked it up.
  if (note.ptStatus === 'flagged' && (await isPT(by.userId))) {
    await db.healthNote.update({ where: { id: noteId }, data: { ptStatus: 'following' } })
  }
  return { ok: true as const, commentId: comment.id }
}

export async function setPtStatus(noteId: string, status: 'following' | 'cleared' | 'reopen', by: Actor) {
  const note = await db.healthNote.findUnique({ where: { id: noteId } })
  if (!note) return { ok: false as const, error: 'Injury not found.' }
  if (status === 'cleared') {
    // Cleared = healed: it becomes past history and leaves the attendance flag.
    await db.$transaction([
      db.healthNote.update({
        where: { id: noteId },
        data: { ptStatus: 'cleared', active: false, clearedAt: new Date(), clearedByName: by.name, updatedByName: by.name },
      }),
      db.healthNoteComment.create({ data: { noteId, body: 'Cleared.', byUserId: by.userId, byName: by.name } }),
    ])
  } else if (status === 'reopen') {
    await db.healthNote.update({
      where: { id: noteId },
      data: { ptStatus: 'following', active: true, clearedAt: null, clearedByName: null },
    })
  } else {
    await db.healthNote.update({ where: { id: noteId }, data: { ptStatus: 'following' } })
  }
  return { ok: true as const }
}

/** The follow-up list: open (flagged/following) or recently cleared. */
export async function listFollowups(gymId: string, view: 'open' | 'cleared') {
  const since = new Date(Date.now() - 30 * 86400_000)
  const notes = await db.healthNote.findMany({
    where: {
      gymId,
      ...(view === 'open' ? { ptStatus: { in: ['flagged', 'following'] } } : { ptStatus: 'cleared', clearedAt: { gte: since } }),
    },
    include: {
      athlete: { select: { id: true, firstName: true, lastName: true, archived: true } },
      comments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: view === 'open' ? [{ flaggedAt: 'asc' }] : [{ clearedAt: 'desc' }],
  })
  return notes
    .filter((n) => !n.athlete.archived)
    .map((n) => ({
      id: n.id,
      athleteId: n.athlete.id,
      athleteName: `${n.athlete.firstName} ${n.athlete.lastName}`,
      kind: n.kind,
      title: n.title,
      details: n.details,
      since: n.since,
      ptStatus: n.ptStatus as PtStatus,
      flaggedAt: n.flaggedAt?.toISOString() ?? null,
      flaggedByName: n.flaggedByName,
      clearedAt: n.clearedAt?.toISOString() ?? null,
      clearedByName: n.clearedByName,
      comments: n.comments.map((c) => ({ id: c.id, body: c.body, byName: c.byName, createdAt: c.createdAt.toISOString() })),
    }))
}
