import { afterEach, expect, test, vi } from 'vitest'
import handler from '../api/proofread'
import { useAIActivityStore } from '../src/store/ai-activity-store'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

test('proofread runs as a Node function with a 60 s limit (Edge cut chunks off at ~25 s)', async () => {
  const mod = await import('../api/proofread')
  expect(mod.config).toEqual({ maxDuration: 60 })
})

test('the Node wrapper forwards the body and returns the provider result', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ content: [{ text: '{"findings":[]}' }], usage: { input_tokens: 5, output_tokens: 3 } }))
  let status = 0
  let sent = ''
  const res = { setHeader() {}, status(c: number) { status = c; return this }, send(b: string) { sent = b } }
  await handler({ method: 'POST', headers: {}, body: { provider: 'anthropic', model: 'claude-sonnet-5', systemPrompt: 's', userPrompt: 'u', apiKey: 'user-key' } } as never, res as never)
  expect(status).toBe(200)
  expect(JSON.parse(sent).text).toBe('{"findings":[]}')
})

test('running spend total accumulates across calls and resets', () => {
  const s = useAIActivityStore.getState()
  s.resetTotal()
  s.recordUsage('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 0 })
  s.recordUsage('claude-sonnet-5', { inputTokens: 0, outputTokens: 100_000 })
  expect(useAIActivityStore.getState().totalCostUSD).toBeCloseTo(3, 5)
  useAIActivityStore.getState().resetTotal()
  expect(useAIActivityStore.getState().totalCostUSD).toBe(0)
  expect(useAIActivityStore.getState().totalInput).toBe(0)
})
