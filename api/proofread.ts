/**
 * Vercel Node Function — Proofread Proxy (Node, not Edge: Edge cuts responses off at ~25 s, and a proofread
 * chunk can take longer; maxDuration matches analyze.ts)
 *
 * Proxies proofread chunk requests to Gemini/Anthropic/OpenAI.
 * Google requires an explicit user key; no server-side Gemini fallback.
 * Anthropic/OpenAI require the user to provide their own key.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createProviderHandler } from './providers.js'

export const config = { maxDuration: 60 }

interface ProofreadRequest {
  systemPrompt: string
  userPrompt: string
  provider: 'google' | 'anthropic' | 'openai'
  model: string
  apiKey?: string
  maxTokens?: number
  jsonMode?: boolean
}

export const handleProofread = createProviderHandler<ProofreadRequest>({
  feature: null,
  prepare: (body) => {
    const { systemPrompt, userPrompt, provider, model } = body

    if (!systemPrompt || !userPrompt || !provider || !model) {
      return new Response('Missing required fields: systemPrompt, userPrompt, provider, model', {
        status: 400,
      })
    }

    return { systemPrompt, userPrompt, maxTokens: body.maxTokens ?? 4096 }
  },
})

// Vercel Node contract (same shape as analyze.ts); desktop calls handleProofread directly.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const forwarded = req.headers['x-forwarded-for']
  const response = await handleProofread(
    new Request('https://coil.local/api/proofread', {
      method: req.method,
      headers: { 'x-forwarded-for': Array.isArray(forwarded) ? forwarded[0] : (forwarded ?? '') },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
    }),
  )
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.status(response.status).send(await response.text())
}
