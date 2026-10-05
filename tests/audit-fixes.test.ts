import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { detectSpeakingCharacter } from '../src/lib/profile-updater'
import { parseJsonLoose } from '../src/lib/json-parse'
import { escapeRegex } from '../src/lib/regex'
import { AIHttpError, dispatchAI } from '../src/lib/ai-dispatch'
import { extractAnthropicText } from '../api/anthropic'
import { routeApi, TESTER_PROXY } from '../desktop/tester-proxy'
import { useEditorStore } from '../src/store/editor-store'
import { useScriptStore } from '../src/store/script-store'
import rewrite from '../api/rewrite'
import structure from '../api/structure'
import subtext from '../api/subtext'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
const post = (path: string, body: object) => new Request(`https://coil.local${path}`, { method: 'POST', body: JSON.stringify(body) })

test('F1 detectSpeakingCharacter uses the in-context offset when context starts before the doc start', () => {
  const doc = `${'x\n'.repeat(400)}\nBOB\nHello there.\n\nALICE\nHi.`
  const from = doc.indexOf('Hello')
  const context = doc.slice(Math.max(0, from - 500), from + 40)
  expect(detectSpeakingCharacter(context, from)).toBe('BOB')
})

test('F3 parseJsonLoose handles fences and preamble, throws a labelled error otherwise', () => {
  expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(parseJsonLoose('Here you go: {"a":2} done')).toEqual({ a: 2 })
  expect(parseJsonLoose('{"a":3}')).toEqual({ a: 3 })
  expect(() => parseJsonLoose('nope', 'subtext analysis')).toThrow('Failed to parse subtext analysis response')
})

test('F14 escapeRegex neutralises regex metacharacters in names', () => {
  expect(new RegExp(`\\b${escapeRegex('DR. (X)+')}`, 'i').test('dr. (x)+')).toBe(true)
})

test('F2 dispatchAI retries only on 429/5xx status, not on a 400 whose body mentions a number', async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn(async () => new Response('bad request: max_tokens 500 exceeded', { status: 400 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(dispatchAI({ task: 'rewrite', systemPrompt: 's', userPrompt: 'u', provider: 'anthropic', model: 'm' })).rejects.toBeInstanceOf(AIHttpError)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  const flaky = vi.fn()
    .mockResolvedValueOnce(new Response('overloaded', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ text: 'ok' }))
  vi.stubGlobal('fetch', flaky)
  const pending = dispatchAI({ task: 'rewrite', systemPrompt: 's', userPrompt: 'u', provider: 'anthropic', model: 'm' })
  await vi.advanceTimersByTimeAsync(1000)
  expect((await pending).text).toBe('ok')
  expect(flaky).toHaveBeenCalledTimes(2)
})

test('F4 extractAnthropicText skips non-text blocks; proxy routes return 502 on empty text', async () => {
  expect(extractAnthropicText({ content: [{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a')
  expect(extractAnthropicText({ content: [{ text: 'a' }, { text: 'b' }] }, true)).toBe('a\nb')
  vi.stubGlobal('fetch', async () => Response.json({ content: [{ type: 'thinking' }] }))
  const res = await subtext(post('/api/subtext', { provider: 'anthropic', model: 'claude-fable-5-1', apiKey: 'k', systemPrompt: 's', userPrompt: 'u' }))
  expect(res.status).toBe(502)
})

test('F6 server-key calls need a supported model and clamp maxTokens; BYOK keeps its model choice', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  const fetchMock = vi.fn(async () => Response.json({ content: [{ text: 'ok' }] }))
  vi.stubGlobal('fetch', fetchMock)
  const base = { provider: 'anthropic', systemPrompt: 's', userPrompt: 'u' }
  expect((await structure(post('/api/structure', { ...base, model: 'claude-expensive-9' }))).status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
  expect((await structure(post('/api/structure', { ...base, model: 'claude-fable-5-1', maxTokens: 9_000_000 }))).status).toBe(200)
  expect(JSON.parse(String((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body)).max_tokens).toBe(16384)
  expect((await structure(post('/api/structure', { ...base, model: 'other-model', apiKey: 'user-key' }))).status).toBe(200)
})

test('F10/F11 usage header: finite for keyless, omitted for BYOK; structure reports 999', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-key')
  vi.stubGlobal('fetch', async () => Response.json({ content: [{ text: 'ok' }] }))
  const body = { selectedText: 'x', surroundingContext: '', instruction: '', provider: 'anthropic', model: 'claude-fable-5-1' }
  expect((await rewrite(post('/api/rewrite', { ...body, apiKey: 'user-key' }))).headers.get('X-Usage-Remaining')).toBeNull()
  expect((await rewrite(post('/api/rewrite', body))).headers.get('X-Usage-Remaining')).toBe('999')
  const s = await structure(post('/api/structure', { provider: 'anthropic', model: 'claude-fable-5-1', systemPrompt: 's', userPrompt: 'u' }))
  expect(s.headers.get('X-Usage-Remaining')).toBe('999')
})

test('F9 openFile resets import warnings and format', () => {
  useEditorStore.getState().setImportWarnings([{ message: 'w' } as never], 'fdx')
  useEditorStore.getState().openFile('a.fountain', 'x')
  expect(useEditorStore.getState().importWarnings).toEqual([])
  expect(useEditorStore.getState().importFormat).toBeNull()
})

test('F7 reverting to the parsed content cancels the pending parse', () => {
  vi.useFakeTimers()
  const store = useScriptStore.getState()
  store.forceUpdate('INT. A - DAY\n\nHi.')
  store.updateFromContent('INT. A - DAY\n\nHi there.')
  expect(useScriptStore.getState().parsing).toBe(true)
  store.updateFromContent('INT. A - DAY\n\nHi.')
  expect(useScriptStore.getState().parsing).toBe(false)
  vi.advanceTimersByTime(500)
  expect(useScriptStore.getState().scenes[0]?.content).toContain('Hi.')
  expect(useScriptStore.getState().scenes[0]?.content).not.toContain('Hi there')
})

test('D-01/D-02 tester proxy returns 502 on network failure and strips content-encoding', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('offline') })
  const local = vi.fn()
  const res = await routeApi(post('/api/rewrite', { apiKey: 'coil_a' }), local)
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({ error: 'offline' })

  vi.stubGlobal('fetch', async () => new Response('{"text":"hi"}', { status: 200, headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } }))
  const ok = await routeApi(post('/api/rewrite', { apiKey: 'coil_a' }), local)
  expect(ok.headers.get('content-encoding')).toBeNull()
  expect(ok.headers.get('content-type')).toBe('application/json')
  expect(await ok.json()).toEqual({ text: 'hi' })
  expect(TESTER_PROXY).toContain('https://')
})
