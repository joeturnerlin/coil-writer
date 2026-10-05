/**
 * Shared provider transport + request handler for the rewrite/subtext/structure/continuity routes.
 * Each route supplies only its prompt-building and rate-limit feature.
 */

import { AVAILABLE_MODELS } from '../src/lib/models'
import { proxyAnthropic } from './anthropic'
import { checkRateLimit, RateLimitError, type RateLimitFeature } from './rate-limit'
import { applyTesterToken, isTesterToken } from './tester'

/** Ceiling on client-requested output tokens (matches analyze). */
export const MAX_OUTPUT_TOKENS = 16384

export function clampMaxTokens(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
  return Math.min(n, MAX_OUTPUT_TOKENS)
}

export async function proxyGemini(system: string, user: string, model: string, maxTokens: number, clientKey?: string) {
  const apiKey = clientKey
  if (!apiKey) {
    return new Response('No Google API key. Add one in Settings.', { status: 400 })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Gemini ${res.status}: ${JSON.stringify(data)}` }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function proxyOpenAI(system: string, user: string, model: string, maxTokens: number, clientKey?: string) {
  const apiKey = clientKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response('No OpenAI API key configured', { status: 500 })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `OpenAI ${res.status}: ${JSON.stringify(data)}` }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = data.choices?.[0]?.message?.content
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

interface ProviderBody {
  provider?: 'google' | 'anthropic' | 'openai'
  model?: string
  apiKey?: string
  maxTokens?: number
}

export interface ProviderPrompt {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
}

interface RouteOptions<B extends ProviderBody> {
  /** Rate-limit feature name; null = not rate limited (remaining reported as 999). */
  feature: RateLimitFeature | null
  /** Validates the body and builds the prompts; return a Response to reject. */
  prepare: (body: B) => ProviderPrompt | Response
}

export function createProviderHandler<B extends ProviderBody>({ feature, prepare }: RouteOptions<B>) {
  return async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'

    let body: B
    try {
      body = await req.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const hasApiKey = Boolean(body.apiKey)
    const usesServerKey = !hasApiKey || isTesterToken(body.apiKey)
    const denied = applyTesterToken(body)
    if (denied) return denied

    const prepared = prepare(body)
    if (prepared instanceof Response) return prepared
    const { systemPrompt, userPrompt } = prepared
    const maxTokens = clampMaxTokens(prepared.maxTokens, 2048)
    const { provider, model } = body as { provider: NonNullable<B['provider']>; model: string }

    // A caller with no key of their own (or a tester token) spends the server's: only the supported model list is allowed.
    if (usesServerKey && !AVAILABLE_MODELS.some((m) => m.id === model && m.provider === provider)) {
      return new Response(`Unsupported model: ${model}`, { status: 400 })
    }

    try {
      const remaining = feature ? (await checkRateLimit(ip, feature, hasApiKey)).remaining : 999

      let response: Response
      if (provider === 'google') {
        response = await proxyGemini(systemPrompt, userPrompt, model, maxTokens, body.apiKey)
      } else if (provider === 'anthropic') {
        response = await proxyAnthropic(systemPrompt, userPrompt, model, maxTokens, body.apiKey)
      } else if (provider === 'openai') {
        response = await proxyOpenAI(systemPrompt, userPrompt, model, maxTokens, body.apiKey)
      } else {
        return new Response(`Unknown provider: ${provider}`, { status: 400 })
      }

      // Clone response to add usage header (omitted when unlimited, e.g. BYOK)
      const headers = new Headers(response.headers)
      if (Number.isFinite(remaining)) headers.set('X-Usage-Remaining', String(remaining))
      return new Response(response.body, {
        status: response.status,
        headers,
      })
    } catch (err) {
      if (err instanceof RateLimitError) {
        return new Response(
          JSON.stringify({
            error: err.message,
            feature: err.feature,
            resetAt: err.resetAt,
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
