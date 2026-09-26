import { NextResponse } from 'next/server'
import { DEFAULT_GYM_ID } from '@/lib/constants'
import { requireOwner } from '@/lib/owner'
import { balances } from '@/lib/money'

export async function GET() {
  const a = await requireOwner()
  if ('error' in a) return a.error
  return NextResponse.json({ success: true, data: await balances(DEFAULT_GYM_ID) })
}
