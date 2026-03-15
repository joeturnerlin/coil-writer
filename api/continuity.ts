/**
 * Vercel Edge Function — Continuity Check Proxy
 *
 * Proxies continuity analysis requests to Gemini/Anthropic/OpenAI.
 * Gemini uses the server-side GEMINI_API_KEY by default.
 * Anthropic/OpenAI require the user to provide their own key.
 */

import { checkRateLimit, RateLimitError } from './rate-limit'

export const config = { runtime: 'edge' }

interface ContinuityRequest {
  systemPrompt: string
  userPrompt: string
  provider: 'google' | 'anthropic' | 'openai'
  model: string
  apiKey?: string
  maxTokens?: number
  jsonMode?: boolean
}

export default async function handler(req: Request) {
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

  let body: ContinuityRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const hasApiKey = Boolean(body.apiKey)
  const { systemPrompt, userPrompt, provider, model } = body
  const maxTokens = body.maxTokens ?? 4096

  if (!systemPrompt || !userPrompt || !provider || !model) {
    return new Response('Missing required fields: systemPrompt, userPrompt, provider, model', {
      status: 400,
    })
  }

  try {
    const { remaining } = await checkRateLimit(ip, 'continuity', hasApiKey)

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

    // Clone response to add usage header
    const headers = new Headers(response.headers)
    headers.set('X-Usage-Remaining', String(remaining))
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

async function proxyGemini(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  clientKey?: string,
) {
  const apiKey = clientKey || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response('No Gemini API key configured', { status: 500 })
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
    return new Response(
      JSON.stringify({ error: `Gemini ${res.status}: ${JSON.stringify(data)}` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function proxyAnthropic(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  clientKey?: string,
) {
  const apiKey = clientKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('No Anthropic API key configured', { status: 500 })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Anthropic ${res.status}: ${JSON.stringify(data)}` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const text = data.content?.[0]?.text
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function proxyOpenAI(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  clientKey?: string,
) {
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
    return new Response(
      JSON.stringify({ error: `OpenAI ${res.status}: ${JSON.stringify(data)}` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const text = data.choices?.[0]?.message?.content
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
