import { afterEach, describe, expect, test, vi } from 'vitest'
import rewrite from '../api/rewrite'
import subtext from '../api/subtext'
import structure from '../api/structure'
import continuity from '../api/continuity'
import { routeApi } from '../desktop/tester-proxy'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const post = (path: string, body: object) => new Request(`https://coil.local${path}`, { method: 'POST', body: JSON.stringify(body) })
const prompts = { systemPrompt: 's', userPrompt: 'u', model: 'claude-fable-5-1' }
const cases: [string, (req: Request) => Promise<Response>, (apiKey: string, provider?: string) => object][] = [
  ['rewrite', rewrite, (apiKey, provider = 'anthropic') => ({ selectedText: 'x', surroundingContext: '', instruction: '', provider, model: 'claude-fable-5-1', apiKey })],
  ['subtext', subtext, (apiKey, provider = 'anthropic') => ({ ...prompts, provider, apiKey })],
  ['structure', structure, (apiKey, provider = 'anthropic') => ({ ...prompts, provider, apiKey })],
  ['continuity', continuity, (apiKey, provider = 'anthropic') => ({ ...prompts, provider, apiKey })],
]

describe.each(cases)('%s handler tester tokens', (name, handler, build) => {
  const path = `/api/${name}`
  const stub = () => {
    const calls: { headers: Headers; body: string }[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls.push({ headers: new Headers(init.headers), body: String(init.body) })
      return Response.json({ content: [{ text: '{}' }] })
    })
    return calls
  }

  test('valid token swaps to the server key and never reaches the provider body', async () => {
    vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a')
    vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
    const calls = stub()
    expect((await handler(post(path, build('coil_a')))).status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.get('x-api-key')).toBe('server-key')
    expect(calls[0].body).not.toContain('coil_')
  })

  test('unknown token is 401 with no provider call', async () => {
    vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a')
    vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
    const calls = stub()
    expect((await handler(post(path, build('coil_nope')))).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  test('google provider with a tester token is 400', async () => {
    vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a')
    const calls = stub()
    expect((await handler(post(path, build('coil_a', 'google')))).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('tokens separated by whitespace both work', async () => {
    vi.stubEnv('COIL_TESTER_TOKENS', ' coil_a ,  coil_b ')
    vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
    stub()
    expect((await handler(post(path, build('coil_a')))).status).toBe(200)
    expect((await handler(post(path, build('coil_b')))).status).toBe(200)
  })
})

test('routeApi falls through to the local handler on an invalid JSON body', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('proxy must not be called') })
  const local = vi.fn(async () => Response.json({ text: 'local' }))
  const req = new Request('https://coil.local/api/rewrite', { method: 'POST', body: '{not json' })
  expect(await (await routeApi(req, local)).json()).toEqual({ text: 'local' })
  expect(local).toHaveBeenCalledOnce()
})

test('a tester token cannot select a model outside the supported list', async () => {
  vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a')
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  vi.stubGlobal('fetch', async () => { throw new Error('provider must not be called') })
  const res = await structure(new Request('https://coil.local/api/structure', { method: 'POST', body: JSON.stringify({ provider: 'anthropic', model: 'claude-any-unlisted-model', systemPrompt: 's', userPrompt: 'u', apiKey: 'coil_a' }) }))
  expect(res.status).toBe(400)
})
