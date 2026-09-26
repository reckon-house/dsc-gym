// Shared bits for the /api/admin/leads routes.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import type { listLeads } from '@/lib/leads'

/** Leads are front-office work: admins only (owners and front desk). */
export async function requireAdmin() {
  const user = await getSession()
  if (!user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  if (user.role !== 'ADMIN') {
    return { error: NextResponse.json({ success: false, error: 'Admins only.' }, { status: 403 }) }
  }
  return { user }
}

type LeadRow = Awaited<ReturnType<typeof listLeads>>[number]

export function serializeLead(l: LeadRow) {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    parentName: l.parentName,
    email: l.email,
    phone: l.phone,
    birthdate: l.birthdate?.toISOString().slice(0, 10) ?? null,
    interest: l.interest,
    source: l.source,
    sourceDetail: l.sourceDetail,
    status: l.status,
    location: l.location,
    groupId: l.groupId,
    followUpOn: l.followUpOn?.toISOString().slice(0, 10) ?? null,
    lastContactedAt: l.lastContactedAt?.toISOString() ?? null,
    lostReason: l.lostReason,
    convertedAthleteId: l.convertedAthleteId,
    createdAt: l.createdAt.toISOString(),
    notes: l.notes.map((n) => ({ id: n.id, body: n.body, byName: n.byName, createdAt: n.createdAt.toISOString() })),
  }
}
