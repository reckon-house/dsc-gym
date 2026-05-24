// Photo → intent. The owner snaps their notepad; Claude vision reads the
// handwriting using the gym's trainer/athlete names as anchors, then
// returns a plain-English transcript that gets routed straight into the
// chat pipeline (same propose → confirm gate as voice and text).

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DEFAULT_GYM_ID } from '@/lib/constants'

const VISION_MODEL = 'claude-opus-4-7'

function getAnthropic(): Anthropic {
  const apiKey = process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('CLAUDE_KEY not configured')
  return new Anthropic({ apiKey })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('image')
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No image' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const mediaType = (
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    ).includes(file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
      ? (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
      : 'image/jpeg'

    // Pull the gym's trainer + athlete names as anchors for handwriting recognition.
    const [trainers, athletes] = await Promise.all([
      db.trainer.findMany({
        where: { gymId: DEFAULT_GYM_ID },
        include: { user: { select: { name: true } } },
      }),
      db.athlete.findMany({
        where: { gymId: DEFAULT_GYM_ID },
        select: { firstName: true, lastName: true },
        take: 200,
      }),
    ])
    const trainerNames = trainers.map((t) => t.user.name)
    const athleteNames = athletes.map((a) => `${a.firstName} ${a.lastName}`)

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })

    const anthropic = getAnthropic()
    const resp = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: buf.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `This is a photo of a gym owner's handwritten weekly schedule. Read it and write out what's on the page in plain English, as if you were dictating it to a scheduling assistant.

Use these known names when matching handwriting (treat them as anchors — pick the closest match):
TRAINERS: ${trainerNames.join(', ')}
ATHLETES: ${athleteNames.slice(0, 100).join(', ')}

Current date/time: ${now} (America/Chicago timezone)

Output ONLY the dictation. No preamble like "Here is what I see". No JSON. If the handwriting is unclear in a place, say so in the dictation ("can't read the time on Wednesday's last entry") rather than guessing. If days of the week are written without a date, assume the upcoming week starting today.`,
            },
          ],
        },
      ],
    })

    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim()

    if (!text) {
      return NextResponse.json({
        success: false,
        error: 'Vision returned no text. Try a clearer photo.',
      })
    }

    return NextResponse.json({ success: true, transcript: text })
  } catch (error) {
    console.error('Vision error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
