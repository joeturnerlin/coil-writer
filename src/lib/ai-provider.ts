/**
 * AI provider abstraction.
 * Supports Anthropic (Claude), OpenAI, and Google (Gemini).
 *
 * In development, Anthropic/OpenAI calls are proxied through Vite dev server
 * to avoid CORS issues. Google Gemini supports CORS directly.
 *
 * In Tauri (Phase 3), all calls go through the Rust backend.
 */

export type AIProvider = 'anthropic' | 'openai' | 'google'

export interface AIModel {
  id: string
  name: string
  provider: AIProvider
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', provider: 'google' },
]

export interface RewriteSuggestion {
  text: string
  reasoning: string
}

export interface RewriteResponse {
  suggestions: RewriteSuggestion[]
}

/**
 * Request a rewrite of the selected text with surrounding context.
 *
 * In production (Vercel), all calls go through /api/rewrite which holds
 * the Gemini API key server-side. In dev, Gemini goes direct and
 * Anthropic/OpenAI are proxied through the Vite dev server.
 */
export async function requestRewrite(
  selectedText: string,
  surroundingContext: string,
  instruction: string,
  provider: AIProvider,
  model: string,
  apiKey: string,
): Promise<RewriteResponse> {
  // In production, use the serverless proxy for all providers
  if (import.meta.env.PROD) {
    return callServerProxy(selectedText, surroundingContext, instruction, provider, model, apiKey)
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(selectedText, surroundingContext, instruction)

  if (provider === 'anthropic') {
    return callAnthropic(systemPrompt, userPrompt, model, apiKey)
  } else if (provider === 'openai') {
    return callOpenAI(systemPrompt, userPrompt, model, apiKey)
  } else {
    return callGemini(systemPrompt, userPrompt, model, apiKey)
  }
}

function buildSystemPrompt(): string {
  return `You are a professional screenplay editor. You rewrite selected text from Fountain-format screenplays.

Rules:
- Return exactly 2 alternative rewrites of the selected text
- Each rewrite should be a different creative approach
- Preserve the Fountain formatting (character names uppercase, etc.)
- Match the tone and style of the surrounding context
- Keep roughly the same length unless the instruction says otherwise

Respond in this exact JSON format:
{"suggestions": [{"text": "rewrite 1", "reasoning": "brief explanation"}, {"text": "rewrite 2", "reasoning": "brief explanation"}]}`
}

function buildUserPrompt(selectedText: string, surroundingContext: string, instruction: string): string {
  return `## Surrounding context:
${surroundingContext}

## Selected text to rewrite:
${selectedText}

## Instruction:
${instruction || 'Rewrite this to be more compelling and vivid.'}`
}

/**
 * Production proxy — routes through /api/rewrite Vercel Edge Function.
 * Gemini uses the server-side API key. Anthropic/OpenAI pass user's key.
 */
async function callServerProxy(
  selectedText: string,
  surroundingContext: string,
  instruction: string,
  provider: AIProvider,
  model: string,
  apiKey: string,
): Promise<RewriteResponse> {
  const res = await fetch('/api/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selectedText,
      surroundingContext,
      instruction,
      provider,
      model,
      // For Gemini, omit key so server uses its own. For others, pass user's key.
      apiKey: provider === 'google' ? undefined : apiKey,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API proxy error: ${res.status} ${err}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return parseRewriteJSON(data.text)
}

async function callAnthropic(system: string, user: string, model: string, apiKey: string): Promise<RewriteResponse> {
  // Proxied through Vite dev server to avoid CORS
  const res = await fetch('/api/anthropic/v1/messages', {
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

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  const text = data.content[0].text
  return parseRewriteJSON(text)
}

async function callOpenAI(system: string, user: string, model: string, apiKey: string): Promise<RewriteResponse> {
  // Proxied through Vite dev server to avoid CORS
  const res = await fetch('/api/openai/v1/chat/completions', {
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

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  const text = data.choices[0].message.content
  return parseRewriteJSON(text)
}

async function callGemini(system: string, user: string, model: string, apiKey: string): Promise<RewriteResponse> {
  // Gemini supports CORS — direct call
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

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  const text = data.candidates[0].content.parts[0].text
  return parseRewriteJSON(text)
}

function parseRewriteJSON(text: string): RewriteResponse {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : text
    const parsed = JSON.parse(jsonStr.trim())
    if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return parsed as RewriteResponse
    }
    throw new Error('Invalid response format')
  } catch {
    // Fallback: treat entire response as a single suggestion
    return {
      suggestions: [{ text: text.trim(), reasoning: 'Raw response (could not parse structured format)' }],
    }
  }
}
