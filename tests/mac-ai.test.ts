import { afterEach, expect, test, vi } from 'vitest'
import analyze from '../api/analyze'
import { useAIStore } from '../src/store/ai-store'

afterEach(() => vi.unstubAllGlobals())

test('fresh rewrite and comparison use the approved providers and models', () => {
  const state = useAIStore.getState()
  expect([state.provider, state.model]).toEqual(['anthropic', 'claude-fable-5-1'])
  expect([state.comparisonModelA, state.comparisonModelB]).toEqual(['claude-fable-5-1', 'gpt-6-astra'])
})

test('analysis forwards a user Anthropic key and the default model, returning provider text', async () => {
  let request: { url: string; body: Record<string, unknown>; key: string } | undefined
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    request = { url, body: JSON.parse(init.body as string), key: new Headers(init.headers).get('x-api-key')! }
    return Response.json({ content: [{ text: '{"characters":[]}' }] })
  })
  let status = 200
  let result: unknown
  const response = {
    setHeader() {},
    status(code: number) { status = code; return this },
    json(body: unknown) { result = body },
    end() {},
  }
  await analyze({ method: 'POST', body: { scriptContent: 'INT. ROOM - DAY', apiKey: 'test-key' } } as never, response as never)
  expect(status).toBe(200)
  expect(result).toEqual({ text: '{"characters":[]}' })
  expect(request?.url).toBe('https://api.anthropic.com/v1/messages')
  expect(request?.body.model).toBe('claude-fable-5-1')
  expect(request?.key).toBe('test-key')
})
