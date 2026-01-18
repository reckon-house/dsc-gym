import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/walkins - List all unclaimed walk-ins (admin only)
export async function GET() {
  try {
    const session = await getSession()

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin only' },
        { status: 401 }
      )
    }

    const walkIns = await db.walkIn.findMany({
      where: { claimed: false },
      orderBy: { checkInTime: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: walkIns,
    })
  } catch (error) {
    console.error('Error fetching walk-ins:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch walk-ins' },
      { status: 500 }
    )
  }
}
