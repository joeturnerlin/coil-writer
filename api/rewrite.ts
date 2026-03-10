/**
 * Vercel Edge Function — AI Rewrite Proxy
 *
 * Proxies rewrite requests to Gemini/Anthropic/OpenAI.
 * Gemini uses the server-side GEMINI_API_KEY by default.
 * Anthropic/OpenAI require the user to provide their own key.
 */

export const config = { runtime: 'edge' }

interface RewriteRequest {
  selectedText: string
  surroundingContext: string
  instruction: string
  provider: 'google' | 'anthropic' | 'openai'
  model: string
  apiKey?: string // Optional — server key used for Gemini if omitted
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

  let body: RewriteRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { selectedText, surroundingContext, instruction, provider, model } = body

  if (!selectedText || !model || !provider) {
    return new Response('Missing required fields: selectedText, model, provider', { status: 400 })
  }

  const systemPrompt = `You are a professional screenplay editor. You rewrite selected text from Fountain-format screenplays.

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

  try {
    if (provider === 'google') {
      return await proxyGemini(systemPrompt, userPrompt, model, body.apiKey)
    } else if (provider === 'anthropic') {
      return await proxyAnthropic(systemPrompt, userPrompt, model, body.apiKey)
    } else if (provider === 'openai') {
      return await proxyOpenAI(systemPrompt, userPrompt, model, body.apiKey)
    }
    return new Response(`Unknown provider: ${provider}`, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function proxyGemini(system: string, user: string, model: string, clientKey?: string) {
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
          maxOutputTokens: 1024,
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

async function proxyAnthropic(system: string, user: string, model: string, apiKey?: string) {
  if (!apiKey) {
    return new Response('Anthropic requires an API key — add yours in Settings', { status: 400 })
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
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Anthropic ${res.status}: ${JSON.stringify(data)}` }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = data.content?.[0]?.text
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function proxyOpenAI(system: string, user: string, model: string, apiKey?: string) {
  if (!apiKey) {
    return new Response('OpenAI requires an API key — add yours in Settings', { status: 400 })
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
      max_tokens: 1024,
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
