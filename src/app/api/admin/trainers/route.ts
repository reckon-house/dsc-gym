import { NextRequest, NextResponse } from 'next/server'
import { getSession, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/admin/trainers - Create a new trainer (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin only' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, email, password } = body

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate email if not provided
    const trainerEmail = email || `${name.toLowerCase().replace(/\s+/g, '.')}@dsc.com`

    // Use default password if not provided
    const trainerPassword = password || 'trainer123'
    const passwordHash = await hashPassword(trainerPassword)

    // Check if email already exists
    const existing = await db.user.findUnique({
      where: { email: trainerEmail },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists' },
        { status: 409 }
      )
    }

    // Create user and trainer
    const user = await db.user.create({
      data: {
        email: trainerEmail,
        passwordHash,
        name,
        role: 'TRAINER',
        trainer: {
          create: {},
        },
      },
      include: {
        trainer: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: user.trainer!.id,
        name: user.name,
        email: user.email,
      },
      message: `Trainer "${name}" created with email ${trainerEmail} and password "${trainerPassword}"`,
    })
  } catch (error) {
    console.error('Error creating trainer:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    )
  }
}
