import Anthropic from '@anthropic-ai/sdk'
import { getStaticTrainerPrompt, buildDynamicTrainerContext, type ParsingContext } from './parsing/prompts'
import { parseClaudeResponse } from './parsing/schema'
import type { ParseResult } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function parseSchedulingInput(
  input: string,
  context: ParsingContext
): Promise<ParseResult> {
  // Use split prompts for optimal caching:
  // - Static prompt (instructions, schema, examples) is cached
  // - Dynamic context (current date, trainer, athletes) is not cached
  const staticPrompt = getStaticTrainerPrompt()
  const dynamicContext = buildDynamicTrainerContext(context)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: staticPrompt,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: dynamicContext,
          // No cache_control - this changes frequently
        },
      ],
      messages: [
        {
          role: 'user',
          content: input,
        },
      ],
    })

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    // Parse the JSON response
    return parseClaudeResponse(textContent.text)
  } catch (error) {
    console.error('Claude API error:', error)

    // Return a fallback response for parsing errors
    return {
      action: 'UNKNOWN',
      confidence: 0,
      data: {},
      clarificationNeeded: 'I could not understand that request. Please try rephrasing.',
      humanReadableSummary: 'Unable to parse request',
    }
  }
}
