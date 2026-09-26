// Coach time off. See src/lib/timeOff.ts.
//
// GET  ?status=pending,approved &from=YYYY-MM-DD &to=YYYY-MM-DD &mine=1
//      Coaches see their own; admins see everyone's. Pending rows carry the
//      sessions the coach is booked on in that window, so the approver sees
//      what would need covering before saying yes.
// POST { startDate, endDate?, startMinute?, endMinute?, reason?, trainerId?, approve? }
//      trainerId/approve are admin-only: an owner entering time off for a coach
//      is already the approval.

import { NextRequest, NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import {
  approveTimeOff,
  listTimeOff,
  requestTimeOff,
  sessionsDuring,
  type TimeOffStatus,
} from '@/lib/timeOff'
import { notifyTimeOffRequested } from '@/lib/notify'

const STATUSES: TimeOffStatus[] = ['pending', 'approved', 'declined', 'cancelled']

function ymdParam(v: string | null): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  return new Date(`${v}T00:00:00.000Z`)
}

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const q = request.nextUrl.searchParams

  // ?scope=all lets a coach see who else is off, for the shared schedule —
  // approved time off only, and without the reason, which can be personal.
  const coachScopeAll = user.role !== 'ADMIN' && q.get('scope') === 'all'
  const mine = !coachScopeAll && (q.get('mine') === '1' || user.role !== 'ADMIN')
  if (mine && !user.trainerId) return NextResponse.json({ success: true, data: [] })

  const status = coachScopeAll
    ? (['approved'] as TimeOffStatus[])
    : (q.get('status') ?? '')
        .split(',')
        .filter((s): s is TimeOffStatus => (STATUSES as string[]).includes(s))

  const rows = await listTimeOff(DEFAULT_GYM_ID, {
    trainerId: mine ? user.trainerId : q.get('trainerId') || undefined,
    status: status.length ? status : undefined,
    from: ymdParam(q.get('from')),
    to: ymdParam(q.get('to')),
  })

  if (coachScopeAll) {
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({ ...r, reason: null, decisionNote: null })),
    })
  }

  const data = await Promise.all(
    rows.map(async (r) =>
      r.status === 'pending' && user.role === 'ADMIN'
        ? {
            ...r,
            booked: await sessionsDuring(
              DEFAULT_GYM_ID,
              r.trainerId,
              new Date(`${r.startDate}T00:00:00.000Z`),
              new Date(`${r.endDate}T00:00:00.000Z`),
              r.startMinute,
              r.endMinute
            ),
          }
        : r
    )
  )
  return NextResponse.json({ success: true, data })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  const isAdmin = user.role === 'ADMIN'
  const trainerId = isAdmin && body.trainerId ? String(body.trainerId) : user.trainerId
  if (!trainerId) {
    return NextResponse.json({ success: false, error: 'Pick which coach this is for.' }, { status: 400 })
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const result = await requestTimeOff({
    gymId: DEFAULT_GYM_ID,
    trainerId,
    startYMD: String(body.startDate ?? ''),
    endYMD: String(body.endDate ?? body.startDate ?? ''),
    startMinute: num(body.startMinute),
    endMinute: num(body.endMinute),
    reason: typeof body.reason === 'string' ? body.reason : null,
    requestedById: user.userId,
  })
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 })

  if (isAdmin && body.approve === true && result.request.status === 'pending') {
    const approved = await approveTimeOff(result.request.id, DEFAULT_GYM_ID, user.userId, null)
    if (!approved.ok) return NextResponse.json({ success: false, error: approved.error }, { status: 400 })
    return NextResponse.json({ success: true, data: { request: approved.request, stranded: approved.stranded } })
  }

  if (!result.duplicate) {
    const id = result.request.id
    after(() => notifyTimeOffRequested(id))
  }
  return NextResponse.json({ success: true, data: { request: result.request, duplicate: result.duplicate } })
}
