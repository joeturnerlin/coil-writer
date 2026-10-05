/**
 * Vercel Edge Function — Structure Analysis Proxy
 *
 * Proxies subtext analysis requests to Gemini/Anthropic/OpenAI.
 * Google requires an explicit user key; no server-side Gemini fallback.
 * Anthropic/OpenAI require the user to provide their own key.
 */

import { createProviderHandler } from './providers'

export const config = { runtime: 'edge' }

interface StructureRequest {
  systemPrompt: string
  userPrompt: string
  provider: 'google' | 'anthropic' | 'openai'
  model: string
  apiKey?: string
  maxTokens?: number
  jsonMode?: boolean
}

export default createProviderHandler<StructureRequest>({
  feature: null,
  prepare: (body) => {
    const { systemPrompt, userPrompt, provider, model } = body

    if (!systemPrompt || !userPrompt || !provider || !model) {
      return new Response('Missing required fields: systemPrompt, userPrompt, provider, model', {
        status: 400,
      })
    }

    return { systemPrompt, userPrompt, maxTokens: body.maxTokens ?? 2048 }
  },
})
