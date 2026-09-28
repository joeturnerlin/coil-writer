import { afterEach, expect, test, vi } from 'vitest'
import { handleAnalysis } from '../api/analyze'
import rewrite from '../api/rewrite'
import subtext from '../api/subtext'
import structure from '../api/structure'
import continuity from '../api/continuity'

const handlers = { analyze: handleAnalysis, rewrite, subtext, structure, continuity }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function request(route: string, apiKey?: string) {
  return new Request(`https://coil.local/api/${route}`, { method: 'POST', body: JSON.stringify({
    provider: 'anthropic', model: 'claude-fable-5-1', apiKey, scriptContent: 'INT. ROOM - DAY',
    selectedText: 'Every frame remembers.', systemPrompt: 'Analyze', userPrompt: 'Test', maxTokens: 321,
  }) })
}

test.each(Object.entries(handlers))('%s preserves Anthropic key precedence, payload and text contract', async (route, handler) => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  const fetch = vi.fn(async () => Response.json({ content: [{ text: 'first' }, { text: 'second' }] }))
  vi.stubGlobal('fetch', fetch)
  for (const key of [undefined, 'user-key']) {
    const response = await handler(request(route, key))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: route === 'analyze' ? 'first\nsecond' : 'first' })
    const [url, init] = fetch.mock.calls.at(-1)! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(new Headers(init.headers).get('x-api-key')).toBe(key ?? 'server-key')
    expect(new Headers(init.headers).get('anthropic-version')).toBe('2023-06-01')
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'claude-fable-5-1', max_tokens: route === 'analyze' ? 16384 : route === 'rewrite' ? 2048 : 321 })
  }
})

test.each(Object.entries(handlers))('%s preserves provider errors and missing-key responses', async (route, handler) => {
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  const fetch = vi.fn(async () => Response.json({ error: 'provider-rejection' }, { status: 429 }))
  vi.stubGlobal('fetch', fetch)
  const missing = await handler(request(route))
  expect(missing.status).toBe(route === 'analyze' ? 400 : 500)
  expect(fetch).not.toHaveBeenCalled()
  const rejected = await handler(request(route, 'user-key'))
  expect(rejected.status).toBe(429)
  expect(await rejected.json()).toEqual({ error: 'Anthropic 429: {"error":"provider-rejection"}' })
})
