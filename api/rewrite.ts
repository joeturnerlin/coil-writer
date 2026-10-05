/**
 * Vercel Edge Function — AI Rewrite Proxy
 *
 * Proxies rewrite requests to Gemini/Anthropic/OpenAI.
 * Google requires an explicit user key; no server-side Gemini fallback.
 * Anthropic/OpenAI require the user to provide their own key.
 */

import { createProviderHandler } from './providers'

export const config = { runtime: 'edge' }

interface RewriteRequest {
  selectedText: string
  surroundingContext: string
  instruction: string
  provider: 'google' | 'anthropic' | 'openai'
  model: string
  apiKey?: string // Google requires a user key; web Anthropic/OpenAI may use server keys.
  systemPromptOverride?: string // Optional — profile-aware system prompt from client
}

export default createProviderHandler<RewriteRequest>({
  feature: 'rewrite',
  prepare: (body) => {
    const { selectedText, surroundingContext, instruction, provider, model, systemPromptOverride } = body

    if (!selectedText || !model || !provider) {
      return new Response('Missing required fields: selectedText, model, provider', { status: 400 })
    }

    const systemPrompt = systemPromptOverride || `You are a professional screenplay editor. You rewrite selected text from Fountain-format screenplays.

Rules:
- Return exactly 2 alternative rewrites of the selected text
- Each rewrite should be a different creative approach
- Preserve the Fountain formatting (character names uppercase, etc.)
- Match the tone and style of the surrounding context
- Keep roughly the same length unless the instruction says otherwise

Respond in this exact JSON format:
{"suggestions": [{"text": "rewrite 1", "reasoning": "brief explanation"}, {"text": "rewrite 2", "reasoning": "brief explanation"}]}`

    const userPrompt = `## Surrounding context:
${surroundingContext}

## Selected text to rewrite:
${selectedText}

## Instruction:
${instruction || 'Rewrite this to be more compelling and vivid.'}`

    return { systemPrompt, userPrompt, maxTokens: 2048 }
  },
})
