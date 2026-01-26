import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

// POST /api/athletes/register - Public athlete self-registration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { firstName, lastName, email, phone, password, legalName } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'First name and last name are required' },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    if (!legalName) {
      return NextResponse.json(
        { success: false, error: 'Legal name is required for waiver' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingAthlete = await db.athlete.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingAthlete) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create athlete
    const athlete = await db.athlete.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        passwordHash,
        trainerId: null, // No trainer assigned yet
      },
    })

    // Get IP address from headers
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

    // Create waiver signature
    await db.waiverSignature.create({
      data: {
        email: email.toLowerCase().trim(),
        legalName: legalName.trim(),
        ipAddress,
        athleteId: athlete.id,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          email: athlete.email,
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
