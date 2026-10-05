import { afterEach, expect, test, vi } from 'vitest'
import rewrite from '../api/rewrite'
import { handleAnalysis } from '../api/analyze'
import { routeApi, TESTER_PROXY } from '../desktop/tester-proxy'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const post = (path: string, body: object) => new Request(`https://coil.local${path}`, { method: 'POST', body: JSON.stringify(body) })
const rewriteBody = (apiKey: string) => ({ selectedText: 'x', surroundingContext: '', instruction: '', provider: 'anthropic', model: 'claude-fable-5-1', apiKey })

test('server swaps a valid tester token for the server key and never forwards the token', async () => {
  vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a, coil_b')
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  let sent = ''
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { sent = new Headers(init.headers).get('x-api-key')!; return Response.json({ content: [{ text: 'ok' }] }) })
  expect((await rewrite(post('/api/rewrite', rewriteBody('coil_b')))).status).toBe(200)
  expect(sent).toBe('server-key')
  expect((await handleAnalysis(post('/api/analyze', { scriptContent: 'INT. ROOM - DAY', apiKey: 'coil_a' }))).status).toBe(200)
  expect(sent).toBe('server-key')
})

test('server rejects an unknown or revoked tester token without calling the provider', async () => {
  vi.stubEnv('COIL_TESTER_TOKENS', 'coil_a')
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  vi.stubGlobal('fetch', async () => { throw new Error('provider must not be called') })
  expect((await rewrite(post('/api/rewrite', rewriteBody('coil_revoked')))).status).toBe(401)
  expect((await handleAnalysis(post('/api/analyze', { scriptContent: 'x', apiKey: 'coil_revoked' }))).status).toBe(401)
})

test('with no tester tokens configured, every tester token is rejected', async () => {
  vi.stubEnv('COIL_TESTER_TOKENS', '')
  expect((await rewrite(post('/api/rewrite', rewriteBody('coil_a')))).status).toBe(401)
})

test('desktop forwards tester tokens to the hosted proxy and keeps real keys local', async () => {
  let forwarded: { url: string; body: string } | undefined
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { forwarded = { url, body: init.body as string }; return Response.json({ text: 'remote' }) })
  const local = vi.fn(async () => Response.json({ text: 'local' }))
  expect(await (await routeApi(post('/api/rewrite', rewriteBody('coil_a')), local)).json()).toEqual({ text: 'remote' })
  expect(forwarded?.url).toBe(`${TESTER_PROXY}/api/rewrite`)
  expect(local).not.toHaveBeenCalled()
  forwarded = undefined
  expect(await (await routeApi(post('/api/rewrite', rewriteBody('sk-ant-real')), local)).json()).toEqual({ text: 'local' })
  expect(forwarded).toBeUndefined()
})
