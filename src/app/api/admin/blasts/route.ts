// GET  /api/admin/blasts   history
// POST /api/admin/blasts   create a DRAFT (never sends)

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { createBlastDraft, type AudienceSpec } from '@/lib/blast'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: session ? 403 : 401 }
    )
  }
  const blasts = await db.blast.findMany({
    where: { gymId: DEFAULT_GYM_ID },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, subject: true, audienceLabel: true, status: true,
      recipientCount: true, sentCount: true, failedCount: true,
      createdAt: true, sentAt: true, source: true,
    },
  })
  return NextResponse.json({ success: true, data: blasts })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Only an admin can send announcements.' },
      { status: session ? 403 : 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const subject = String(body.subject ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (!subject || !text) {
    return NextResponse.json(
      { success: false, error: 'Subject and body are both required.' },
      { status: 400 }
    )
  }

  const spec = body.audience as AudienceSpec
  if (!spec || !['all', 'group', 'age_band'].includes(spec.kind)) {
    return NextResponse.json(
      { success: false, error: 'audience.kind must be all, group or age_band.' },
      { status: 400 }
    )
  }

  const result = await createBlastDraft({
    gymId: DEFAULT_GYM_ID,
    spec,
    subject,
    body: text,
    source: 'admin_ui',
    createdById: session.userId,
  })
  if ('error' in result) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  // Deliberately returns a preview, not a send. The confirm step is separate.
  return NextResponse.json({
    success: true,
    data: {
      blastId: result.blast.id,
      audienceLabel: result.audience.label,
      recipientCount: result.audience.uniqueEmails,
      excluded: result.audience.excluded,
      sample: result.audience.recipients.slice(0, 5).map((r) => `${r.firstName} ${r.lastName[0]}.`),
    },
  })
}
