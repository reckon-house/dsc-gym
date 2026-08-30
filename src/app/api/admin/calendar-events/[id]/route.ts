// Edit or cancel one company-calendar meeting.
//
// DELETE is a soft cancel (cancelled=true) rather than a row delete, matching
// how sessions and groups behave: the calendar keeps a record of what was on
// the books, and engine rule 4b stops blocking the trainers immediately.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can edit meetings.' },
      { status: session ? 403 : 401 }
    )
  }

  const { id } = await params
  const existing = await db.calendarEvent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Meeting not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) {
      return NextResponse.json(
        { success: false, error: 'A meeting needs a title.' },
        { status: 400 }
      )
    }
    data.title = title
  }
  if (body.description !== undefined) {
    const d = String(body.description ?? '').trim()
    data.description = d === '' ? null : d
  }
  if (body.startsAt !== undefined) {
    const startsAt = new Date(String(body.startsAt))
    if (Number.isNaN(startsAt.getTime())) {
      return NextResponse.json(
        { success: false, error: 'startsAt is not a valid datetime.' },
        { status: 400 }
      )
    }
    data.startsAt = startsAt
  }
  if (body.duration !== undefined) data.duration = Number(body.duration)
  // Empty array is meaningful here — it means "all staff", not "unchanged".
  if (Array.isArray(body.trainerIds)) data.trainerIds = body.trainerIds.map(String)
  if (body.cancelled !== undefined) data.cancelled = Boolean(body.cancelled)

  const updated = await db.calendarEvent.update({ where: { id }, data })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can cancel meetings.' },
      { status: session ? 403 : 401 }
    )
  }
  const { id } = await params
  const existing = await db.calendarEvent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Meeting not found' }, { status: 404 })
  }
  await db.calendarEvent.update({ where: { id }, data: { cancelled: true } })
  return NextResponse.json({ success: true })
}
