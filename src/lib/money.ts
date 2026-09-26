// Money: what sessions are worth, what came in, and who owes.
//
// Payment happens outside the app. The app knows two things: what each visit
// is worth (the price sheet × who attended) and what the owners recorded as
// paid. Everything here is derived from those, so changing a price re-prices
// history rather than leaving stored numbers out of date.
//
// Two words used carefully:
//   earned    — visits × price. What the work was worth.
//   collected — payments recorded. What actually came in.
// They differ (monthly members, comps, people who are behind), and the owners
// need both.

import { db } from '@/lib/db'
import { getGymTimezone } from '@/lib/scheduling/engine'
import { dateOnlyInZone, partsInZone } from '@/lib/scheduling/timezone'

export type ClassType = 'private' | 'semi_private' | 'group'
export const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  private: 'Private',
  semi_private: 'Semi-private',
  group: 'Group',
}

interface Rate {
  classType: string | null
  durationMinutes: number | null
  priceCents: number
}

/**
 * What kind of class a session is. A named group is a group however many
 * showed up; otherwise it's by headcount — one athlete is private, two or
 * three semi-private, four or more a group.
 */
export function classTypeOf(s: { groupId: string | null }, rosterSize: number): ClassType {
  if (s.groupId) return 'group'
  if (rosterSize <= 1) return 'private'
  if (rosterSize <= 3) return 'semi_private'
  return 'group'
}

export async function loadRates(gymId: string): Promise<Rate[]> {
  return db.priceItem.findMany({
    where: { gymId, active: true, unit: 'session', classType: { not: null } },
    select: { classType: true, durationMinutes: true, priceCents: true },
  })
}

/**
 * Per-athlete price for one visit, or null when the sheet has no rate for it.
 * Order: the group's own price → exact type+length → the type's any-length
 * rate → the nearest length of that type, scaled by minutes.
 */
export function priceVisit(
  rates: Rate[],
  classType: ClassType,
  duration: number,
  groupPriceCents: number | null
): number | null {
  if (groupPriceCents !== null && groupPriceCents !== undefined) return groupPriceCents
  const ofType = rates.filter((r) => r.classType === classType)
  if (ofType.length === 0) return null
  const exact = ofType.find((r) => r.durationMinutes === duration)
  if (exact) return exact.priceCents
  const any = ofType.find((r) => r.durationMinutes === null)
  if (any) return any.priceCents
  const nearest = ofType
    .filter((r) => r.durationMinutes)
    .sort((a, b) => Math.abs(a.durationMinutes! - duration) - Math.abs(b.durationMinutes! - duration))[0]
  return nearest ? Math.round((nearest.priceCents * duration) / nearest.durationMinutes!) : null
}

/** Today in the gym's zone as a @db.Date value. */
async function gymToday(gymId: string): Promise<Date> {
  const zone = await getGymTimezone(gymId)
  const p = partsInZone(new Date(), zone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Attendance → billable or not. */
type VisitKind = 'confirmed' | 'estimated' | 'no_show_charged' | null

function visitKind(
  status: string | null,
  attendanceTaken: boolean,
  chargeNoShows: boolean
): VisitKind {
  if (status === 'present') return 'confirmed'
  if (status === 'no_show') return chargeNoShows ? 'no_show_charged' : null
  // Nobody marked this athlete. If attendance was taken for the session,
  // everyone was marked, so an unmarked row can't happen; if it wasn't, we
  // assume they came — and say so.
  return attendanceTaken ? null : 'estimated'
}

async function pastVisits(gymId: string, from: Date, to: Date) {
  return db.session.findMany({
    where: { gymId, cancelled: false, scheduledAt: { gte: from, lt: to } },
    include: {
      attendees: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true, billingPlan: true } } },
      },
      group: { select: { id: true, name: true, priceCents: true } },
      trainer: { select: { id: true, user: { select: { name: true } } } },
    },
  })
}

export interface RevenueReport {
  from: string
  to: string
  earnedCents: number
  confirmedCents: number
  estimatedCents: number
  noShowCents: number
  recoveryCents: number
  collectedCents: number
  visits: number
  estimatedVisits: number
  compVisits: number
  unpricedVisits: number
  coachHours: number
  perCoachHourCents: number | null
  byClassType: { classType: ClassType; label: string; earnedCents: number; visits: number; sessions: number; hours: number; perHourCents: number | null }[]
  byCoach: { trainerId: string; name: string; earnedCents: number; sessions: number; hours: number; perHourCents: number | null }[]
  byClass: { key: string; label: string; earnedCents: number; sessions: number; avgPerSessionCents: number; avgAthletes: number }[]
}

/**
 * Revenue for sessions that started in [from, to). "Earned" is priced at the
 * CURRENT price sheet; comp athletes contribute nothing.
 */
export async function revenueReport(gymId: string, from: Date, to: Date): Promise<RevenueReport> {
  const now = new Date()
  const until = to < now ? to : now
  const [rates, config, sessions, recovery, payments] = await Promise.all([
    loadRates(gymId),
    db.gymConfig.findUnique({ where: { gymId }, select: { noShowPolicy: true } }),
    pastVisits(gymId, from, until),
    db.recoveryVisit.aggregate({ where: { gymId, at: { gte: from, lt: until } }, _sum: { priceCents: true } }),
    db.payment.aggregate({
      where: { gymId, voidedAt: null, paidOn: { gte: new Date(ymd(from) + 'T00:00:00Z'), lt: new Date(ymd(to) + 'T00:00:00Z') } },
      _sum: { amountCents: true },
    }),
  ])
  const chargeNoShows = config?.noShowPolicy === 'charge'

  const r: RevenueReport = {
    from: from.toISOString(),
    to: to.toISOString(),
    earnedCents: 0,
    confirmedCents: 0,
    estimatedCents: 0,
    noShowCents: 0,
    recoveryCents: recovery._sum.priceCents ?? 0,
    collectedCents: payments._sum.amountCents ?? 0,
    visits: 0,
    estimatedVisits: 0,
    compVisits: 0,
    unpricedVisits: 0,
    coachHours: 0,
    perCoachHourCents: null,
    byClassType: [],
    byCoach: [],
    byClass: [],
  }
  const types = new Map<ClassType, { earned: number; visits: number; sessions: number; hours: number }>()
  const coaches = new Map<string, { name: string; earned: number; sessions: number; hours: number }>()
  const classes = new Map<string, { label: string; earned: number; sessions: number; athletes: number }>()

  for (const s of sessions) {
    const type = classTypeOf(s, s.attendees.length)
    const rate = priceVisit(rates, type, s.duration, s.group?.priceCents ?? null)
    let sessionEarned = 0
    let billable = 0
    for (const a of s.attendees) {
      const kind = visitKind(a.status, Boolean(s.attendanceTakenAt), chargeNoShows)
      if (!kind) continue
      if (a.athlete.billingPlan === 'comp') {
        r.compVisits++
        continue
      }
      billable++
      if (kind !== 'no_show_charged') r.visits++
      if (kind === 'estimated') r.estimatedVisits++
      if (rate === null) {
        r.unpricedVisits++
        continue
      }
      sessionEarned += rate
      if (kind === 'confirmed') r.confirmedCents += rate
      else if (kind === 'estimated') r.estimatedCents += rate
      else r.noShowCents += rate
    }
    // A session nobody attended (or only comps) isn't a coaching hour sold.
    if (billable === 0) continue
    const hours = s.duration / 60
    r.coachHours += hours
    r.earnedCents += sessionEarned

    const t = types.get(type) ?? { earned: 0, visits: 0, sessions: 0, hours: 0 }
    t.earned += sessionEarned
    t.visits += billable
    t.sessions++
    t.hours += hours
    types.set(type, t)

    const c = coaches.get(s.trainer.id) ?? { name: s.trainer.user.name, earned: 0, sessions: 0, hours: 0 }
    c.earned += sessionEarned
    c.sessions++
    c.hours += hours
    coaches.set(s.trainer.id, c)

    const key = s.group ? `g:${s.group.id}` : `t:${type}:${s.duration}`
    const label = s.group ? s.group.name : `${CLASS_TYPE_LABEL[type]} · ${s.duration} min`
    const k = classes.get(key) ?? { label, earned: 0, sessions: 0, athletes: 0 }
    k.earned += sessionEarned
    k.sessions++
    k.athletes += billable
    classes.set(key, k)
  }

  const perHour = (cents: number, hours: number) => (hours > 0 ? Math.round(cents / hours) : null)
  r.perCoachHourCents = perHour(r.earnedCents, r.coachHours)
  r.byClassType = [...types].map(([classType, t]) => ({
    classType,
    label: CLASS_TYPE_LABEL[classType],
    earnedCents: t.earned,
    visits: t.visits,
    sessions: t.sessions,
    hours: t.hours,
    perHourCents: perHour(t.earned, t.hours),
  }))
  r.byCoach = [...coaches]
    .map(([trainerId, c]) => ({
      trainerId,
      name: c.name,
      earnedCents: c.earned,
      sessions: c.sessions,
      hours: c.hours,
      perHourCents: perHour(c.earned, c.hours),
    }))
    .sort((a, b) => b.earnedCents - a.earnedCents)
  r.byClass = [...classes]
    .map(([key, k]) => ({
      key,
      label: k.label,
      earnedCents: k.earned,
      sessions: k.sessions,
      avgPerSessionCents: Math.round(k.earned / k.sessions),
      avgAthletes: Math.round((k.athletes / k.sessions) * 10) / 10,
    }))
    .sort((a, b) => b.earnedCents - a.earnedCents)
  return r
}

// ---------------------------------------------------------------- balances

export interface BalanceRow {
  athleteId: string
  name: string
  email: string
  plan: 'per_session' | 'monthly' | 'comp'
  /** per_session: owed = charges − payments. Negative = credit. */
  owedCents: number
  chargesCents: number
  paidCents: number
  visits: number
  estimatedVisits: number
  unpricedVisits: number
  /** monthly */
  paidThrough: string | null
  daysBehind: number | null
  lastPaymentOn: string | null
  behind: boolean
}

/**
 * Where every active athlete stands. Visits only count from the billing start
 * date; before that date is set, per-session balances are not computed at all
 * (null start) — otherwise switching this on would bill everyone's history.
 */
export async function balances(gymId: string): Promise<{ startedOn: string | null; rows: BalanceRow[] }> {
  const config = await db.gymConfig.findUnique({ where: { gymId }, select: { billingStartDate: true, noShowPolicy: true } })
  const start = config?.billingStartDate ?? null
  const zone = await getGymTimezone(gymId)
  const today = await gymToday(gymId)

  const athletes = await db.athlete.findMany({
    where: { gymId, archived: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      billingPlan: true,
      paidThrough: true,
      payments: { where: { voidedAt: null }, select: { amountCents: true, paidOn: true }, orderBy: { paidOn: 'desc' } },
    },
  })

  const charges = new Map<string, { cents: number; visits: number; estimated: number; unpriced: number }>()
  if (start) {
    const from = dateOnlyInZone(ymd(start), zone)!
    const [rates, sessions, recovery] = await Promise.all([
      loadRates(gymId),
      pastVisits(gymId, from, new Date()),
      db.recoveryVisit.findMany({ where: { gymId, at: { gte: from } }, select: { athleteId: true, priceCents: true } }),
    ])
    const chargeNoShows = config?.noShowPolicy === 'charge'
    for (const s of sessions) {
      const type = classTypeOf(s, s.attendees.length)
      const rate = priceVisit(rates, type, s.duration, s.group?.priceCents ?? null)
      for (const a of s.attendees) {
        const kind = visitKind(a.status, Boolean(s.attendanceTakenAt), chargeNoShows)
        if (!kind) continue
        const c = charges.get(a.athleteId) ?? { cents: 0, visits: 0, estimated: 0, unpriced: 0 }
        c.visits++
        if (kind === 'estimated') c.estimated++
        if (rate === null) c.unpriced++
        else c.cents += rate
        charges.set(a.athleteId, c)
      }
    }
    for (const v of recovery) {
      const c = charges.get(v.athleteId) ?? { cents: 0, visits: 0, estimated: 0, unpriced: 0 }
      c.cents += v.priceCents
      charges.set(v.athleteId, c)
    }
  }

  const rows: BalanceRow[] = athletes.map((a) => {
    const plan = (['per_session', 'monthly', 'comp'].includes(a.billingPlan) ? a.billingPlan : 'per_session') as BalanceRow['plan']
    const c = charges.get(a.id) ?? { cents: 0, visits: 0, estimated: 0, unpriced: 0 }
    const paid = a.payments
      .filter((p) => !start || p.paidOn >= start)
      .reduce((sum, p) => sum + p.amountCents, 0)
    const owed = plan === 'per_session' ? c.cents - paid : 0
    const daysBehind =
      plan === 'monthly'
        ? a.paidThrough
          ? Math.max(0, Math.round((today.getTime() - a.paidThrough.getTime()) / 86400_000))
          : null
        : null
    const behind =
      plan === 'per_session'
        ? Boolean(start) && owed > 0
        : plan === 'monthly'
          ? !a.paidThrough || a.paidThrough < today
          : false
    return {
      athleteId: a.id,
      name: `${a.firstName} ${a.lastName}`,
      email: a.email,
      plan,
      owedCents: owed,
      chargesCents: plan === 'per_session' ? c.cents : 0,
      paidCents: paid,
      visits: c.visits,
      estimatedVisits: c.estimated,
      unpricedVisits: c.unpriced,
      paidThrough: a.paidThrough ? ymd(a.paidThrough) : null,
      daysBehind,
      lastPaymentOn: a.payments[0] ? ymd(a.payments[0].paidOn) : null,
      behind,
    }
  })
  rows.sort((x, y) => Number(y.behind) - Number(x.behind) || y.owedCents - x.owedCents || x.name.localeCompare(y.name))
  return { startedOn: start ? ymd(start) : null, rows }
}

// ---------------------------------------------------------------- payments

export const PAYMENT_METHODS = ['cash', 'card', 'venmo', 'zelle', 'check', 'other'] as const

export function parseDollars(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null
  return Math.round(n * 100)
}

export async function recordPayment(
  gymId: string,
  input: { athleteId: string; amount: unknown; paidOn?: unknown; method?: unknown; note?: unknown; coversThrough?: unknown },
  byUserId: string
) {
  const athlete = await db.athlete.findUnique({
    where: { id: input.athleteId },
    select: { id: true, gymId: true, firstName: true, lastName: true, billingPlan: true, paidThrough: true },
  })
  if (!athlete || athlete.gymId !== gymId) return { ok: false as const, error: 'Athlete not found.' }
  const cents = parseDollars(input.amount)
  if (cents === null) return { ok: false as const, error: 'Enter an amount, like 120 or 120.50.' }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const paidOn =
    typeof input.paidOn === 'string' && dateRe.test(input.paidOn)
      ? new Date(`${input.paidOn}T00:00:00Z`)
      : await gymToday(gymId)
  const covers =
    typeof input.coversThrough === 'string' && dateRe.test(input.coversThrough)
      ? new Date(`${input.coversThrough}T00:00:00Z`)
      : null
  const method =
    typeof input.method === 'string' && (PAYMENT_METHODS as readonly string[]).includes(input.method) ? input.method : null
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null

  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        gymId,
        athleteId: athlete.id,
        athleteName: `${athlete.firstName} ${athlete.lastName}`,
        amountCents: cents,
        paidOn,
        method,
        note,
        coversThrough: covers,
        recordedById: byUserId,
      },
    })
    // A monthly payment moves the paid-through date forward — never back.
    if (covers && (!athlete.paidThrough || covers > athlete.paidThrough)) {
      await tx.athlete.update({ where: { id: athlete.id }, data: { paidThrough: covers } })
    }
    return p
  })
  return { ok: true as const, payment }
}

export async function voidPayment(gymId: string, id: string) {
  const p = await db.payment.findUnique({ where: { id } })
  if (!p || p.gymId !== gymId) return { ok: false as const, error: 'Payment not found.' }
  if (p.voidedAt) return { ok: false as const, error: 'Already voided.' }
  // Voided, not deleted: a money record should show that it was reversed.
  await db.payment.update({ where: { id }, data: { voidedAt: new Date() } })
  return { ok: true as const }
}

/** One athlete's billing page: plan, recent priced visits, payments, balance. */
export async function athleteBilling(gymId: string, athleteId: string) {
  const [all, athlete, payments] = await Promise.all([
    balances(gymId),
    db.athlete.findUnique({ where: { id: athleteId }, select: { billingPlan: true, paidThrough: true, billingNote: true } }),
    db.payment.findMany({ where: { athleteId }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], take: 50 }),
  ])
  const row = all.rows.find((r) => r.athleteId === athleteId) ?? null
  return {
    startedOn: all.startedOn,
    plan: athlete?.billingPlan ?? 'per_session',
    paidThrough: athlete?.paidThrough ? ymd(athlete.paidThrough) : null,
    billingNote: athlete?.billingNote ?? null,
    balance: row,
    payments: payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      paidOn: ymd(p.paidOn),
      method: p.method,
      note: p.note,
      coversThrough: p.coversThrough ? ymd(p.coversThrough) : null,
      voided: Boolean(p.voidedAt),
    })),
  }
}
