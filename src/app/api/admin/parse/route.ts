import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildAdminSystemPrompt } from '@/lib/parsing/admin-prompts'
import { executeAdminAction, AdminParseResult } from '@/lib/parsing/admin-actions'

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
    const { text, execute = false } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text input is required' },
        { status: 400 }
      )
    }

    // Get context: all trainers and athletes
    const trainers = await db.trainer.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    const athletes = await db.athlete.findMany({
      include: {
        trainer: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
      take: 100, // Limit for context size
    })

    // Get today's and tomorrow's sessions for context
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

    const upcomingSessions = await db.session.findMany({
      where: {
        scheduledAt: {
          gte: today,
          lt: dayAfterTomorrow,
        },
        cancelled: false,
      },
      include: {
        athlete: true,
        trainer: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    })

    // Get timezone offset for correct time handling
    const now = new Date()
    const timezoneOffset = now.getTimezoneOffset() // in minutes, negative for ahead of UTC
    const timezoneOffsetHours = -timezoneOffset / 60 // convert to hours, positive for CST-like zones
    const timezoneStr = timezoneOffsetHours >= 0 ? `UTC-${timezoneOffsetHours}` : `UTC+${-timezoneOffsetHours}`

    const context = {
      currentDate: now.toISOString(),
      localTime: now.toLocaleString(),
      timezone: timezoneStr,
      timezoneOffsetHours,
      trainers: trainers.map((t) => ({
        id: t.id,
        userId: t.user.id,
        name: t.user.name,
        email: t.user.email,
      })),
      allAthletes: athletes
        .filter((a) => a.trainer !== null)
        .map((a) => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          trainerName: a.trainer!.user.name,
          trainerId: a.trainerId!,
        })),
      upcomingSessions: upcomingSessions.map((s) => ({
        id: s.id,
        athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
        athleteId: s.athleteId,
        trainerName: s.trainer.user.name,
        trainerId: s.trainerId,
        scheduledAt: s.scheduledAt.toISOString(),
        duration: s.duration,
      })),
    }

    // Call Claude to parse the command
    const systemPrompt = buildAdminSystemPrompt(context)

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    })

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No response from AI' },
        { status: 500 }
      )
    }

    // Parse the JSON response
    let parseResult: AdminParseResult
    try {
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
      }
      parseResult = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Could not parse AI response',
        raw: textContent.text,
      })
    }

    // If preview mode, just return the parse result
    if (!execute) {
      return NextResponse.json({
        success: true,
        parsed: parseResult,
        preview: true,
      })
    }

    // Execute the action
    const executionResult = await executeAdminAction(parseResult)

    return NextResponse.json({
      success: executionResult.success,
      parsed: parseResult,
      execution: executionResult,
      preview: false,
    })
  } catch (error) {
    console.error('Admin parse error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
