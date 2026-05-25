// Decline a BookingRequest. Optional reason makes its way back to the
// athlete via their MCP client / dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = request.headers.get('x-user-id') || null

  let body: { reason?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* no body */
  }

  const req = await db.bookingRequest.findUnique({ where: { id } })
  if (!req) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  if (req.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Already ${req.status}.` },
      { status: 400 }
    )
  }

  await db.bookingRequest.update({
    where: { id },
    data: {
      status: 'declined',
      declineReason: body.reason ?? null,
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  })

  return NextResponse.json({ success: true })
}
