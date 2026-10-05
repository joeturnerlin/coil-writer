import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import analyze from '../api/analyze'
import { proxyAnthropic } from '../api/anthropic'
import { proxyGemini, proxyOpenAI } from '../api/providers'
import { requestRewrite } from '../src/lib/ai-provider'
import { UNCERTAIN_NOTE, aiFetch, classifyAIError } from '../src/lib/ai-fetch'
import { dispatchAI } from '../src/lib/ai-dispatch'
import { estimateCostUSD, MODEL_PRICES } from '../src/lib/models'
import { analyzeScriptViaProxy } from '../src/lib/script-analysis'
import { formatTokens, formatUSD, parseAnthropicUsage, parseGeminiUsage, parseOpenAIUsage } from '../src/lib/usage'
import { useAIActivityStore } from '../src/store/ai-activity-store'
import { useAIStore } from '../src/store/ai-store'

vi.mock('../src/lib/persistence', () => ({
  getVoiceProfile: async () => null,
  saveVoiceProfile: async () => {},
  deleteVoiceProfile: async () => {},
}))

const json = (body: unknown, status = 200) => Response.json(body, { status })

beforeEach(() => {
  useAIActivityStore.setState({ lastCall: null, sessionInput: 0, sessionOutput: 0, sessionCostUSD: 0, unpricedCalls: 0, networkError: false })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

test('price math: priced Anthropic models, unpriced others', () => {
  expect(estimateCostUSD('claude-fable-5-1', 1_000_000, 1_000_000)).toBe(60)
  expect(estimateCostUSD('claude-opus-5-5', 1200, 800)).toBeCloseTo(0.0208, 6)
  expect(estimateCostUSD('claude-haiku-4-5-20251001', 1000, 1000)).toBeCloseTo(0.006, 6)
  expect(estimateCostUSD('gpt-6-astra', 1000, 1000)).toBeNull()
  expect(estimateCostUSD('gemini-2.5-pro', 1000, 1000)).toBeNull()
  expect(Object.keys(MODEL_PRICES)).not.toContain('gpt-6-astra')
  expect(formatTokens(1234)).toBe('1.2k')
  expect(formatTokens(800)).toBe('800')
  expect(formatUSD(0.04)).toBe('$0.04')
  expect(formatUSD(0.001)).toBe('<$0.01')
})

test('usage parsers read Anthropic, OpenAI and Gemini fields', () => {
  expect(parseAnthropicUsage({ usage: { input_tokens: 10, output_tokens: 5 } })).toEqual({ inputTokens: 10, outputTokens: 5 })
  expect(parseOpenAIUsage({ usage: { prompt_tokens: 7, completion_tokens: 3 } })).toEqual({ inputTokens: 7, outputTokens: 3 })
  expect(parseGeminiUsage({ usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 6 } })).toEqual({ inputTokens: 4, outputTokens: 8 })
  expect(parseAnthropicUsage({})).toBeUndefined()
})

test('server handlers pass usage through next to text', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'k')
  vi.stubGlobal('fetch', async () => json({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 11, output_tokens: 22 } }))
  expect(await (await proxyAnthropic('s', 'u', 'claude-fable-5-1', 100, 'key')).json()).toEqual({ text: 'hi', usage: { inputTokens: 11, outputTokens: 22 } })
  vi.stubGlobal('fetch', async () => json({ choices: [{ message: { content: 'yo' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }))
  expect(await (await proxyOpenAI('s', 'u', 'gpt-6-astra', 100, 'key')).json()).toEqual({ text: 'yo', usage: { inputTokens: 3, outputTokens: 4 } })
  vi.stubGlobal('fetch', async () => json({ candidates: [{ content: { parts: [{ text: 'g' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 } }))
  expect(await (await proxyGemini('s', 'u', 'gemini-2.5-pro', 100, 'key')).json()).toEqual({ text: 'g', usage: { inputTokens: 5, outputTokens: 6 } })
})

test('analyze handler returns usage', async () => {
  vi.stubGlobal('fetch', async () => json({ content: [{ text: '{}' }], usage: { input_tokens: 100, output_tokens: 50 } }))
  let result: unknown
  const res = { setHeader() {}, status() { return this }, json(b: unknown) { result = b }, end() {} }
  await analyze({ method: 'POST', body: { scriptContent: 'INT. A - DAY', apiKey: 'k' } } as never, res as never)
  expect(result).toEqual({ text: '{}', usage: { inputTokens: 100, outputTokens: 50 } })
})

test('dispatchAI proxy path records usage; a retried call counts only the call that returned usage', async () => {
  vi.useFakeTimers()
  useAIStore.setState({ provider: 'anthropic', model: 'claude-opus-5-5' })
  let calls = 0
  vi.stubGlobal('fetch', async () => {
    calls++
    return calls === 1 ? new Response('boom', { status: 500 }) : json({ text: 'ok', usage: { inputTokens: 1200, outputTokens: 800 } })
  })
  const p = dispatchAI({ task: 'structure', systemPrompt: 's', userPrompt: 'u' })
  await vi.advanceTimersByTimeAsync(1100)
  const result = await p
  expect(calls).toBe(2)
  expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 800 })
  const s = useAIActivityStore.getState()
  expect([s.sessionInput, s.sessionOutput]).toEqual([1200, 800])
  expect(s.lastCall?.costUSD).toBeCloseTo(0.0208, 6)
})

test('dispatchAI proxy path with an unpriced model counts tokens, no dollars', async () => {
  useAIStore.setState({ provider: 'openai', model: 'gpt-6-astra' })
  vi.stubGlobal('fetch', async () => json({ text: 'ok', usage: { inputTokens: 10, outputTokens: 20 } }))
  await dispatchAI({ task: 'rewrite', systemPrompt: 's', userPrompt: 'u' })
  const s = useAIActivityStore.getState()
  expect(s.lastCall?.costUSD).toBeNull()
  expect([s.sessionCostUSD, s.unpricedCalls, s.sessionInput]).toEqual([0, 1, 10])
})

test('direct client path (requestRewrite, dev Anthropic/OpenAI/Gemini shapes) records usage', async () => {
  const rewrite = '{"suggestions":[{"text":"a","reasoning":"b"}]}'
  vi.stubGlobal('fetch', async () => json({ content: [{ text: rewrite }], usage: { input_tokens: 100, output_tokens: 10 } }))
  await requestRewrite('x', 'c', 'i', 'anthropic', 'claude-sonnet-5', 'k')
  vi.stubGlobal('fetch', async () => json({ choices: [{ message: { content: rewrite } }], usage: { prompt_tokens: 50, completion_tokens: 5 } }))
  await requestRewrite('x', 'c', 'i', 'openai', 'gpt-6-astra', 'k')
  vi.stubGlobal('fetch', async () => json({ candidates: [{ content: { parts: [{ text: rewrite }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 2 } }))
  await requestRewrite('x', 'c', 'i', 'google', 'gemini-2.5-pro', 'k')
  const s = useAIActivityStore.getState()
  expect([s.sessionInput, s.sessionOutput, s.unpricedCalls]).toEqual([170, 17, 2])
  expect(s.sessionCostUSD).toBeCloseTo((100 * 2 + 10 * 10) / 1e6, 9)
})

test('analysis fetch records usage from the proxy body', async () => {
  vi.stubGlobal('fetch', async () => json({ text: '{"characters":[{"name":"ANNA"}]}', usage: { inputTokens: 900, outputTokens: 100 } }))
  await analyzeScriptViaProxy(`INT. ROOM - DAY\n\nANNA\nHello ${Math.random()}`)
  expect(useAIActivityStore.getState().lastCall).toMatchObject({ inputTokens: 900, outputTokens: 100, model: 'claude-fable-5-1' })
})

test('retry state machine: classification of failures', async () => {
  vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
  const net = await aiFetch('/api/x').catch((e) => e)
  expect(classifyAIError(net)).toEqual({ network: true, uncertain: true, retryable: true })
  expect(net.message).toContain(UNCERTAIN_NOTE.trim())
  expect(useAIActivityStore.getState().networkError).toBe(true)

  vi.stubGlobal('fetch', async () => json({ ok: 1 }))
  await aiFetch('/api/x')
  expect(useAIActivityStore.getState().networkError).toBe(false)

  const { AIHttpError } = await import('../src/lib/ai-fetch')
  expect(classifyAIError(new AIHttpError('x', 429))).toEqual({ network: false, uncertain: false, retryable: true })
  expect(classifyAIError(new AIHttpError('x', 503))).toEqual({ network: false, uncertain: false, retryable: true })
  expect(classifyAIError(new AIHttpError('x', 504))).toEqual({ network: false, uncertain: true, retryable: true })
  expect(classifyAIError(new AIHttpError('x', 400))).toEqual({ network: false, uncertain: false, retryable: false })
  expect(classifyAIError(new Error('x')).retryable).toBe(false)
})

test('504 message says the request may have been charged and is not auto-retried', async () => {
  let calls = 0
  vi.stubGlobal('fetch', async () => { calls++; return new Response('timeout', { status: 504 }) })
  const err = await dispatchAI({ task: 'structure', systemPrompt: 's', userPrompt: 'u' }).catch((e) => e)
  expect(calls).toBe(1)
  expect(err.message).toContain('may have been charged')
})

test('abort is not reported as a network error', async () => {
  vi.stubGlobal('fetch', async () => { throw new DOMException('aborted', 'AbortError') })
  await expect(aiFetch('/api/x')).rejects.toMatchObject({ name: 'AbortError' })
  expect(useAIActivityStore.getState().networkError).toBe(false)
})
