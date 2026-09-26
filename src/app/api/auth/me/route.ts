import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isOwner } from '@/lib/owner'

export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      // isOwner read fresh so the UI can show or hide money screens.
      user: { ...session, isOwner: await isOwner(session.userId) },
    })
  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
