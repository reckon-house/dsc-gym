// Cents → "$85" / "$85.50". Client-safe.

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const neg = cents < 0
  const v = Math.abs(cents) / 100
  const s = v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: v % 1 ? 2 : 0 })
  return neg ? `−${s}` : s
}
