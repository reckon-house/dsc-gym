import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

interface ParsedRegistration {
  firstName: string
  lastName: string
  email: string
  phone?: string
  confidence: number
  clarificationNeeded?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text input is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key not configured' },
        { status: 500 }
      )
    }

    const anthropic = new Anthropic({ apiKey })

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: `You are a registration form parser for a gym. Extract user information from free-form text input.

Users will type something like:
- "Justin Jefferson, jjefferson@gmail.com, 214-697-4578"
- "John Smith john@email.com 555-123-4567"
- "Sarah Connor, sarah.connor@skynet.com"

Extract:
- First name
- Last name
- Email address
- Phone number (optional)

Return ONLY valid JSON (no markdown, no explanation):
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string or null",
  "confidence": 0.0 to 1.0,
  "clarificationNeeded": "string or null"
}

Rules:
- If you can't find an email, set confidence low and ask for clarification
- Phone is optional - set to null if not provided
- Clean up phone numbers to a consistent format (just digits and dashes)
- If the input is ambiguous or missing required info, set clarificationNeeded
- Be lenient with formatting - users may use commas, spaces, or newlines as separators`,
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    })

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No response from AI' },
        { status: 500 }
      )
    }

    // Parse the JSON response
    let parsed: ParsedRegistration
    try {
      let jsonStr = textContent.text.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
      }
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Could not parse the input. Please try again with your name, email, and phone number.',
      })
    }

    // Validate required fields
    if (!parsed.firstName || !parsed.lastName || !parsed.email) {
      return NextResponse.json({
        success: false,
        error: parsed.clarificationNeeded || 'Please provide your full name and email address.',
        parsed,
      })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(parsed.email)) {
      return NextResponse.json({
        success: false,
        error: 'Please provide a valid email address.',
        parsed,
      })
    }

    return NextResponse.json({
      success: true,
      parsed,
    })
  } catch (error) {
    console.error('Parse registration error:', error)
    return NextResponse.json(
      { success: false, error: 'An error occurred while parsing' },
      { status: 500 }
    )
  }
}
