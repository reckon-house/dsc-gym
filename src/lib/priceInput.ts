// Validation for price sheet lines, shared by create and edit.

import { parseDollars } from '@/lib/money'

const CLASS_TYPES = ['private', 'semi_private', 'group']
const UNITS = ['session', 'month', 'package']

export function parsePriceItem(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {}
  const has = (k: string) => body[k] !== undefined
  if (has('name') || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) return { error: 'Give it a name, like "Private session".' }
    data.name = name
  }
  if (has('price') || !partial) {
    const cents = parseDollars(body.price)
    if (cents === null) return { error: 'Enter a price, like 85.' }
    data.priceCents = cents
  }
  if (has('classType')) {
    const c = body.classType
    if (c !== null && c !== '' && !CLASS_TYPES.includes(String(c))) return { error: 'Unknown class type.' }
    data.classType = c ? String(c) : null
  }
  if (has('unit')) {
    if (!UNITS.includes(String(body.unit))) return { error: 'Unknown unit.' }
    data.unit = String(body.unit)
  }
  if (has('durationMinutes')) {
    const d = body.durationMinutes === null || body.durationMinutes === '' ? null : Number(body.durationMinutes)
    if (d !== null && (!Number.isInteger(d) || d < 10 || d > 240)) return { error: 'Length must be 10–240 minutes.' }
    data.durationMinutes = d
  }
  if (has('sessionsIncluded')) {
    const n = body.sessionsIncluded === null || body.sessionsIncluded === '' ? null : Number(body.sessionsIncluded)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 500)) return { error: 'Sessions included must be a whole number.' }
    data.sessionsIncluded = n
  }
  if (has('description')) data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 300) : null
  if (has('isPublic')) data.isPublic = Boolean(body.isPublic)
  if (has('active')) data.active = Boolean(body.active)
  if (has('sortOrder')) data.sortOrder = Number(body.sortOrder) || 0
  // Only per-session lines with a class type are used to price visits.
  const unit = data.unit ?? body.unit
  if (unit && unit !== 'session' && data.classType) data.classType = null
  return { data }
}
