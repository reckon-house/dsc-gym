// Leads and the waitlist: people interested in DSC who aren't athletes yet.
//
// The point is follow-up. A lead with no next step is how a parent who DM'd in
// August never hears back, so every open lead is nudged toward having a
// follow-up date, and the admin home and morning digest surface the ones due.
//
// Converting makes a real Athlete from the lead's details (the lead keeps a
// link to it) and can drop them straight into the group they were waiting on.

import { db } from '@/lib/db'
import { addAthleteToGroup } from '@/lib/groups'
import { normalizePhone } from '@/lib/phone'
import { parseBirthdate } from '@/lib/guardian'
import { resolveLocation } from '@/lib/locations'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { partsInZone } from '@/lib/scheduling/timezone'

export const LEAD_SOURCES = ['instagram', 'referral', 'website', 'walk_in', 'event', 'google', 'other'] as const
export const LEAD_STATUSES = ['new', 'contacted', 'trial', 'waitlist', 'converted', 'lost'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]
export type LeadStatus = (typeof LEAD_STATUSES)[number]
/** Still being worked. */
export const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'trial', 'waitlist']

export interface LeadInput {
  firstName?: unknown
  lastName?: unknown
  parentName?: unknown
  email?: unknown
  phone?: unknown
  birthdate?: unknown
  interest?: unknown
  source?: unknown
  sourceDetail?: unknown
  status?: unknown
  location?: unknown
  groupId?: unknown
  followUpOn?: unknown
  lostReason?: unknown
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function ymdDate(v: unknown): Date | null | 'invalid' {
  if (v === null || v === '' || v === undefined) return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'invalid'
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? 'invalid' : d
}

/** Today in the gym's zone, as the @db.Date value follow-ups are stored as. */
export async function gymToday(gymId: string, now: Date = new Date()): Promise<Date> {
  const zone = await getGymTimezone(gymId)
  const p = partsInZone(now, zone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

async function parse(gymId: string, input: LeadInput, partial: boolean) {
  const data: Record<string, unknown> = {}
  const has = (k: keyof LeadInput) => input[k] !== undefined

  if (has('firstName') || !partial) {
    const f = text(input.firstName, 60)
    if (!f) return { error: "Add the athlete's first name." }
    data.firstName = f
  }
  for (const [k, max] of [
    ['lastName', 60],
    ['parentName', 120],
    ['interest', 300],
    ['sourceDetail', 200],
    ['lostReason', 300],
  ] as const) {
    if (has(k)) data[k] = text(input[k], max)
  }
  if (has('email')) {
    const e = text(input.email, 200)?.toLowerCase() ?? null
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: "That email doesn't look right." }
    data.email = e
  }
  if (has('phone')) {
    const raw = text(input.phone, 40)
    if (raw) {
      const p = normalizePhone(raw)
      if (!p) return { error: 'Enter a 10-digit US phone number.' }
      data.phone = p
    } else data.phone = null
  }
  if (has('birthdate')) {
    const raw = text(input.birthdate, 10)
    if (raw) {
      const b = parseBirthdate(raw)
      if (!b) return { error: 'That birthdate is not valid.' }
      data.birthdate = b
    } else data.birthdate = null
  }
  if (has('source')) {
    if (!LEAD_SOURCES.includes(input.source as LeadSource)) return { error: 'Unknown source.' }
    data.source = input.source
  }
  if (has('status')) {
    if (!LEAD_STATUSES.includes(input.status as LeadStatus)) return { error: 'Unknown status.' }
    if (input.status === 'converted') return { error: 'Use Convert to make them an athlete.' }
    data.status = input.status
  }
  if (has('location')) {
    const l = await resolveLocation(gymId, input.location)
    if (!l.ok) return { error: l.error }
    data.location = l.value
  }
  if (has('groupId')) {
    const g = text(input.groupId, 40)
    if (g) {
      const group = await db.group.findUnique({ where: { id: g }, select: { gymId: true } })
      if (!group || group.gymId !== gymId) return { error: 'Group not found.' }
    }
    data.groupId = g
  }
  if (has('followUpOn')) {
    const d = ymdDate(input.followUpOn)
    if (d === 'invalid') return { error: 'Follow-up date must be YYYY-MM-DD.' }
    data.followUpOn = d
  }
  return { data }
}

const include = {
  notes: { orderBy: { createdAt: 'desc' as const } },
}

export async function createLead(gymId: string, input: LeadInput & { note?: unknown }, by: { userId: string; name: string }) {
  const p = await parse(gymId, input, false)
  if ('error' in p) return { ok: false as const, error: p.error! }
  // A waitlist entry for a group is the common case of "waitlist".
  if (p.data.groupId && !p.data.status) p.data.status = 'waitlist'
  const note = text(input.note, 2000)
  const lead = await db.lead.create({
    data: {
      gymId,
      ...(p.data as { firstName: string }),
      createdById: by.userId,
      ...(note ? { notes: { create: [{ body: note, byName: by.name }] } } : {}),
    },
    include,
  })
  return { ok: true as const, lead, duplicates: await possibleDuplicates(gymId, lead) }
}

export async function updateLead(gymId: string, id: string, input: LeadInput, by: { name: string }) {
  const existing = await db.lead.findUnique({ where: { id } })
  if (!existing || existing.gymId !== gymId) return { ok: false as const, error: 'Lead not found.' }
  if (existing.status === 'converted' && input.status !== undefined) {
    return { ok: false as const, error: 'Already converted — edit the athlete instead.' }
  }
  const p = await parse(gymId, input, true)
  if ('error' in p) return { ok: false as const, error: p.error! }
  const data = { ...p.data }
  // Moving to "contacted" is a contact; stamp it so "last touched" is honest.
  if (data.status === 'contacted' && existing.status !== 'contacted') data.lastContactedAt = new Date()
  // A lost lead has nothing left to follow up.
  if (data.status === 'lost') data.followUpOn = null
  const lead = await db.lead.update({ where: { id }, data, include })
  void by
  return { ok: true as const, lead }
}

export async function addLeadNote(
  gymId: string,
  id: string,
  body: unknown,
  by: { name: string },
  opts: { contacted?: boolean; followUpOn?: unknown } = {}
) {
  const existing = await db.lead.findUnique({ where: { id } })
  if (!existing || existing.gymId !== gymId) return { ok: false as const, error: 'Lead not found.' }
  const b = text(body, 2000)
  if (!b) return { ok: false as const, error: 'Write something first.' }
  const follow = opts.followUpOn === undefined ? undefined : ymdDate(opts.followUpOn)
  if (follow === 'invalid') return { ok: false as const, error: 'Follow-up date must be YYYY-MM-DD.' }
  const lead = await db.lead.update({
    where: { id },
    data: {
      notes: { create: [{ body: b, byName: by.name }] },
      ...(opts.contacted
        ? {
            lastContactedAt: new Date(),
            ...(existing.status === 'new' ? { status: 'contacted' } : {}),
          }
        : {}),
      ...(follow !== undefined ? { followUpOn: follow } : {}),
    },
    include,
  })
  return { ok: true as const, lead }
}

/** Same email or phone as an existing lead or athlete — likely the same family. */
export async function possibleDuplicates(
  gymId: string,
  lead: { id: string; email: string | null; phone: string | null }
) {
  const or = [
    ...(lead.email ? [{ email: lead.email }] : []),
    ...(lead.phone ? [{ phone: lead.phone }] : []),
  ]
  if (or.length === 0) return { leads: [], athletes: [] }
  const [leads, athletes] = await Promise.all([
    db.lead.findMany({
      where: { gymId, id: { not: lead.id }, OR: or },
      select: { id: true, firstName: true, lastName: true, status: true },
    }),
    db.athlete.findMany({
      where: { gymId, OR: or },
      select: { id: true, firstName: true, lastName: true, archived: true },
    }),
  ])
  return { leads, athletes }
}

export async function listLeads(
  gymId: string,
  opts: { status?: LeadStatus[]; due?: boolean; search?: string } = {}
) {
  const today = await gymToday(gymId)
  const q = opts.search?.trim()
  return db.lead.findMany({
    where: {
      gymId,
      ...(opts.status ? { status: { in: opts.status } } : {}),
      ...(opts.due ? { status: { in: OPEN_STATUSES }, followUpOn: { lte: today } } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { parentName: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q.replace(/\D/g, '') || q } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  })
}

/** Counts for the admin home and the digest. */
export async function leadSummary(gymId: string) {
  const today = await gymToday(gymId)
  const [due, overdue, open, noNextStep, waitlist] = await Promise.all([
    db.lead.count({ where: { gymId, status: { in: OPEN_STATUSES }, followUpOn: { lte: today } } }),
    db.lead.count({ where: { gymId, status: { in: OPEN_STATUSES }, followUpOn: { lt: today } } }),
    db.lead.count({ where: { gymId, status: { in: OPEN_STATUSES } } }),
    db.lead.count({ where: { gymId, status: { in: OPEN_STATUSES }, followUpOn: null } }),
    db.lead.count({ where: { gymId, status: 'waitlist' } }),
  ])
  return { due, overdue, open, noNextStep, waitlist }
}

/**
 * Make the lead an athlete. Uses the lead's details; `overrides` fills gaps
 * (a last name, a coach). Adds them to the waitlisted group when asked.
 */
export async function convertLead(
  gymId: string,
  id: string,
  opts: { trainerId?: string | null; addToGroup?: boolean; lastName?: string | null } = {},
  by: { name: string }
) {
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead || lead.gymId !== gymId) return { ok: false as const, error: 'Lead not found.' }
  if (lead.status === 'converted' && lead.convertedAthleteId) {
    return { ok: false as const, error: 'Already converted.', athleteId: lead.convertedAthleteId }
  }
  const lastName = (opts.lastName ?? lead.lastName ?? '').trim()
  if (!lastName) return { ok: false as const, error: 'Add a last name before converting.' }

  const email =
    lead.email ??
    `${lead.firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${Date.now()}@placeholder.com`

  const athlete = await db.athlete.create({
    data: {
      gymId,
      firstName: lead.firstName,
      lastName,
      email,
      phone: lead.phone,
      birthdate: lead.birthdate,
      parentName: lead.parentName,
      parentPhone: lead.parentName ? lead.phone : null,
      trainerId: opts.trainerId || null,
      // Same as a staff-added athlete: the gym vouches for the contact.
      emailVerified: Boolean(lead.email),
    },
  })

  await db.lead.update({
    where: { id },
    data: {
      status: 'converted',
      convertedAthleteId: athlete.id,
      convertedAt: new Date(),
      followUpOn: null,
      notes: { create: [{ body: `Converted to athlete by ${by.name}.`, byName: by.name }] },
    },
  })

  let group: { added: boolean; reason?: string; name?: string } | null = null
  if (opts.addToGroup && lead.groupId) {
    const g = await db.group.findUnique({ where: { id: lead.groupId }, select: { name: true } })
    const r = await addAthleteToGroup(lead.groupId, athlete.id)
    group = { added: r.added, reason: r.reason, name: g?.name }
  }

  return {
    ok: true as const,
    athleteId: athlete.id,
    name: `${athlete.firstName} ${athlete.lastName}`,
    placeholderEmail: !lead.email,
    group,
  }
}
