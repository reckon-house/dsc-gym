// Take attendance for one session.
//
// GET  the roster with each athlete's recorded status
// POST { absent?: athleteId[], dropIns?: athleteId[], marks?: [...] }
//      Everyone not marked absent is recorded present — coaches tap the
//      exceptions, not the whole class.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { activeHealthFlags } from '@/lib/health'
import { canTakeAttendance, recordAttendance, type AttendanceStatus } from '@/lib/attendance'

async function authorise(sessionId: string) {
  const user = await getSession()
  if (!user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  const ok = await canTakeAttendance(sessionId, {
    userId: user.userId,
    role: user.role,
    trainerId: user.trainerId,
  })
  if (!ok) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Only the coaches on this session or an admin can take attendance.' },
        { status: 403 }
      ),
    }
  }
  return { user }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  const s = await db.session.findUnique({
    where: { id },
    include: {
      attendees: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' },
      },
      trainer: { select: { user: { select: { name: true } } } },
      group: { select: { name: true } },
    },
  })
  if (!s) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })

  // Anyone at the gym can drop into a class, not just the coach's own
  // athletes — so the picker needs the whole active roster. Names only.
  const candidates = await db.athlete.findMany({
    where: { gymId: s.gymId, archived: false },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: 'asc' },
  })

  // Current injuries/PT, so the coach sees them at the moment it matters.
  const health = await activeHealthFlags(s.attendees.map((r) => r.athlete.id))

  return NextResponse.json({
    success: true,
    data: {
      id: s.id,
      scheduledAt: s.scheduledAt,
      duration: s.duration,
      coach: s.trainer.user.name,
      groupName: s.group?.name ?? null,
      takenAt: s.attendanceTakenAt,
      candidates,
      roster: s.attendees.map((r) => ({
        athleteId: r.athlete.id,
        name: `${r.athlete.firstName} ${r.athlete.lastName}`,
        status: r.status,
        dropIn: r.dropIn,
        health: health.get(r.athlete.id) ?? [],
      })),
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  const body = await request.json().catch(() => ({}))
  const absent: string[] = Array.isArray(body.absent) ? body.absent.map(String) : []
  const explicit: { athleteId: string; status: AttendanceStatus }[] = Array.isArray(body.marks)
    ? body.marks
        .filter((m: { status?: string }) => m.status === 'present' || m.status === 'no_show')
        .map((m: { athleteId: string; status: AttendanceStatus }) => ({
          athleteId: String(m.athleteId),
          status: m.status,
        }))
    : []
  const marks = [
    ...explicit,
    ...absent
      .filter((id) => !explicit.some((m) => m.athleteId === id))
      .map((athleteId) => ({ athleteId, status: 'no_show' as const })),
  ]

  const r = await recordAttendance({
    gymId: DEFAULT_GYM_ID,
    sessionId: id,
    marks,
    dropIns: Array.isArray(body.dropIns) ? body.dropIns.map(String) : [],
    byUserId: a.user.userId,
  })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, data: r })
}
