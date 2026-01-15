import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/athletes/register - Public athlete self-registration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { firstName, lastName, address } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'First name and last name are required' },
        { status: 400 }
      )
    }

    // Generate a unique email for the athlete (used for identification)
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@athlete.dsc.com`

    const athlete = await db.athlete.create({
      data: {
        firstName,
        lastName,
        email,
        address: address || null,
        trainerId: null, // No trainer assigned yet
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error registering athlete:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during registration'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
