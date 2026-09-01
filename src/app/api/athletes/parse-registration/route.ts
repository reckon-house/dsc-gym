// Turn free text from the check-in kiosk into name / email / phone.
//
// Public on purpose: the kiosk is a tablet at the front desk with no session.
// That is also why this must not call an LLM. It used to — a Claude request
// on an unauthenticated route that anyone on the internet could POST to at
// will, for a task that is three regular expressions. Now it costs nothing,
// returns in microseconds, and cannot be used to run up a bill.
//
// Response shape is unchanged from the model-backed version so the kiosk does
// not know the difference.

import { NextRequest, NextResponse } from 'next/server'
import { parseRegistrationText } from '@/lib/parseRegistration'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { text } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text input is required' },
        { status: 400 }
      )
    }

    // Bound the input: a regex over a megabyte of junk is still a waste.
    const parsed = parseRegistrationText(text.slice(0, 2000))

    return NextResponse.json({ success: true, parsed })
  } catch (error) {
    console.error('Error parsing registration:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
