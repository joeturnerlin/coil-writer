/**
 * AI Dispatch — centralized AI call routing.
 *
 * Every new AI call in the app goes through dispatchAI().
 * Handles: provider selection, key lookup, rate limit headers,
 * error normalization, single retry on 429/5xx.
 */

import { useAIStore } from '../store/ai-store'
import type { AIProvider } from './ai-provider'

export type AITask = 'rewrite' | 'analyze' | 'subtext' | 'structure' | 'continuity' | 'stash-retrieval'

export interface AIDispatchOptions {
  task: AITask
  systemPrompt: string
  userPrompt: string
  provider?: AIProvider
  model?: string
  maxTokens?: number
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface AIDispatchResult {
  text: string
  usageRemaining?: number
}

export async function dispatchAI(options: AIDispatchOptions): Promise<AIDispatchResult> {
  try {
    return await dispatchOnce(options)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/429|5\d\d/.test(msg)) {
      const delay = /429/.test(msg) ? 3000 : 1000
      await new Promise((r) => setTimeout(r, delay))
      return dispatchOnce(options)
    }
    throw err
  }
}

async function dispatchOnce(options: AIDispatchOptions): Promise<AIDispatchResult> {
  const store = useAIStore.getState()
  const provider = options.provider ?? store.provider
  const model = options.model ?? store.model
  const apiKey = store.apiKeys[provider] || ''

  if (import.meta.env.PROD) {
    return callProxy(options, provider, model, apiKey)
  }

  if (provider === 'google') {
    return callGeminiDirect(options, model, apiKey)
  }

  return callProxy(options, provider, model, apiKey)
}

async function callProxy(
  options: AIDispatchOptions,
  provider: AIProvider,
  model: string,
  apiKey: string,
): Promise<AIDispatchResult> {
  const endpoint = taskToEndpoint(options.task)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
      provider,
      model,
      apiKey: apiKey || undefined,
      maxTokens: options.maxTokens ?? 2048,
      jsonMode: options.jsonMode ?? false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI proxy error (${options.task}): ${res.status} ${err}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  const usageRemaining = res.headers.get('X-Usage-Remaining')

  return {
    text: data.text,
    usageRemaining: usageRemaining ? Number.parseInt(usageRemaining, 10) : undefined,
  }
}

async function callGeminiDirect(options: AIDispatchOptions, model: string, apiKey: string): Promise<AIDispatchResult> {
  if (!apiKey) {
    throw new Error('No Gemini API key. Add one in Settings.')
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemPrompt }] },
        contents: [{ parts: [{ text: options.userPrompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 2048,
          ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${options.task} error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(`Empty Gemini response for ${options.task}`)

  return { text }
}

function taskToEndpoint(task: AITask): string {
  switch (task) {
    case 'rewrite':
      return '/api/rewrite'
    case 'analyze':
      return '/api/analyze'
    case 'subtext':
      return '/api/subtext'
    case 'structure':
      return '/api/structure'
    case 'continuity':
      return '/api/continuity'
    case 'stash-retrieval':
      return '/api/rewrite'
    default:
      return '/api/rewrite'
  }
}
