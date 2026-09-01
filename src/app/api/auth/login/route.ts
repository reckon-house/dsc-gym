import { NextRequest, NextResponse } from 'next/server'
import { login } from '@/lib/auth'
import { checkRateLimit, clientIp, tooManyRequests, RULES } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Two buckets: the caller's address, and the account being tried. The
    // first stops one machine hammering the form; the second stops a slow
    // spray across many addresses against a single login.
    const ip = clientIp(request)
    const byIp = await checkRateLimit(RULES.login, ip)
    if (!byIp.allowed) return tooManyRequests(byIp, 'sign-in attempts')
    const byAccount = await checkRateLimit(RULES.login, `acct:${String(email).toLowerCase()}`)
    if (!byAccount.allowed) return tooManyRequests(byAccount, 'sign-in attempts')

    const result = await login(email, password)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: result.user,
    })
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
