import { afterEach, expect, test, vi } from 'vitest'
import analyze from '../api/analyze'
import { useAIStore } from '../src/store/ai-store'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

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

test.each(['rewrite', 'subtext', 'structure', 'continuity'])('%s requires the user Google key even when the web server has a Gemini key', async (route) => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  vi.stubEnv('GEMINI_API_KEY', 'server-key-must-not-be-used')
  vi.stubGlobal('fetch', async () => { throw new Error('Provider network must not be called') })
  const { default: handler } = await import(`../api/${route}`)
  const response = await handler(new Request(`https://coil.local/api/${route}`, { method: 'POST', body: JSON.stringify({ provider: 'google', model: 'gemini-2.5-pro', systemPrompt: 'Analyze', userPrompt: 'Test', selectedText: 'Every frame remembers something.' }) }))
  expect(response.status).toBe(400)
})

test('keyed Google selections remain current while unkeyed or retired models migrate', async () => {
  const { currentModel, DEFAULT_MODEL, OPTIONAL_GOOGLE_MODEL } = await import('../src/lib/models')
  expect(currentModel(OPTIONAL_GOOGLE_MODEL.id, DEFAULT_MODEL, 'google-key')).toEqual(OPTIONAL_GOOGLE_MODEL)
  expect(currentModel(OPTIONAL_GOOGLE_MODEL.id)).toEqual(DEFAULT_MODEL)
  expect(currentModel('retired-model')).toEqual(DEFAULT_MODEL)
})
