import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseSchedulingInput } from '@/lib/claude'
import { executeAction } from '@/lib/parsing/actions'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get trainer ID (from session for trainers, or from body for admin)
    let trainerId = session.trainerId
    const body = await request.json()
    const { text, execute = false, targetTrainerId } = body

    // Admin can specify a trainer
    if (session.role === 'ADMIN' && targetTrainerId) {
      trainerId = targetTrainerId
    }

    if (!trainerId) {
      return NextResponse.json(
        { success: false, error: 'No trainer context available' },
        { status: 400 }
      )
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text input is required' },
        { status: 400 }
      )
    }

    // Get trainer info and their athletes for context
    const trainer = await db.trainer.findUnique({
      where: { id: trainerId },
      include: {
        user: true,
        athletes: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    if (!trainer) {
      return NextResponse.json(
        { success: false, error: 'Trainer not found' },
        { status: 404 }
      )
    }

    // Parse the input with Claude
    const parseResult = await parseSchedulingInput(text, {
      trainerId: trainer.id,
      trainerName: trainer.user.name,
      existingAthletes: trainer.athletes,
      currentDate: new Date().toISOString(),
    })

    // If just parsing (preview mode), return the parse result
    if (!execute) {
      return NextResponse.json({
        success: true,
        parsed: parseResult,
        preview: true,
      })
    }

    // Execute the action
    const executionResult = await executeAction(parseResult, trainerId)

    return NextResponse.json({
      success: executionResult.success,
      parsed: parseResult,
      execution: executionResult,
      preview: false,
    })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred while parsing' },
      { status: 500 }
    )
  }
}
