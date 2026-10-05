import { EditorState } from '@codemirror/state'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFindPanel } from '../src/editor/find-panel'
import { emptyDropCounts } from '../src/lib/proofread-types'
import { verifyFindings } from '../src/lib/proofread-verify'
import { buildScriptIndex } from '../src/lib/script-index'

const run = (src: string, raw: unknown[], range?: [number, number]) => {
  const index = buildScriptIndex(src)
  const d = emptyDropCounts()
  const kept = verifyFindings(raw, { index, source: src, range: range ?? [1, index.lineStarts.length] }, d)
  return { kept, d }
}
const spell = (line: number, quote: string, suggestion: string) => ({
  category: 'spelling',
  claim: 'typo',
  suggestion,
  evidence: [{ line, quote }],
})

describe('verifier (items 4-7)', () => {
  const SRC = ['INT. A - DAY', '', 'The tethered boat.', '', 'MARCUS', 'Annabel waits.', '', 'ANN', 'Hi.', ''].join(
    '\n',
  )

  test('4. spelling quote must be a whole word on the cited line, not a substring', () => {
    const { kept, d } = run(SRC, [spell(3, 'tether', 'tithe')])
    expect(kept).toHaveLength(0)
    expect(d['quote-not-found']).toBe(1)
  })

  test('4. wrong-name quote must be a whole word, not part of another word', () => {
    const raw = { category: 'wrong-name', claim: 'x', suggestion: 'Eve', evidence: [{ line: 6, quote: 'Ann' }] }
    expect(run(SRC, [raw]).kept).toHaveLength(0) // 'Ann' is only inside 'Annabel'
    const whole = { ...raw, evidence: [{ line: 8, quote: 'ANN' }] }
    expect(run(SRC, [whole]).kept).toHaveLength(1)
  })

  test('5. a +/-1 hit stores the ACTUAL line and its text', () => {
    expect(run(SRC, [spell(4, 'Annabel', 'Anabel')]).kept).toHaveLength(0) // Annabel is on line 6, two away
    const near = run(SRC, [spell(2, 'tethered', 'tattered')]).kept
    expect(near).toHaveLength(1)
    expect(near[0].evidence[0]).toMatchObject({ line: 3, lineText: 'The tethered boat.' })
  })

  test('5. ambiguous (both neighbours) or outside the chunk -> dropped', () => {
    const src = 'INT. A - DAY\n\nzorble one.\n\nzorble two.\n\n'
    const both = run(src, [{ ...spell(4, 'zorble', 'zombie') }])
    expect(both.kept).toHaveLength(0)
    expect(both.d['quote-not-found']).toBe(1)
    const outside = run(SRC, [spell(4, 'tethered', 'tattered')], [4, 10])
    expect(outside.kept).toHaveLength(0)
    expect(outside.d['quote-not-found']).toBe(1)
  })

  const SRC2 = 'INT. YARD - DAY\n\nBright sun on the grass.\n\nEXT. ROAD - NIGHT\n\nThe moon is out.\n'
  const dn = (evidence: { line: number; quote: string }[]) => ({ category: 'day-night', claim: 'x', evidence })

  test('6. continuity quotes need >=4 non-space chars and whole words', () => {
    expect(
      run(SRC2, [
        dn([
          { line: 3, quote: 'sun' },
          { line: 7, quote: 'moon is out' },
        ]),
      ]).kept,
    ).toHaveLength(0)
    expect(
      run(SRC2, [
        dn([
          { line: 3, quote: 'right sun' },
          { line: 7, quote: 'moon is out' },
        ]),
      ]).kept,
    ).toHaveLength(0)
    expect(
      run(SRC2, [
        dn([
          { line: 3, quote: 'Bright sun' },
          { line: 7, quote: 'moon is out' },
        ]),
      ]).kept,
    ).toHaveLength(1)
  })

  test('6. the different-lines rule uses where the quotes were actually found', () => {
    // cited 5 and 6, but both quotes really live on line 5
    const r = run(SRC2, [
      dn([
        { line: 5, quote: 'EXT. ROAD' },
        { line: 6, quote: 'ROAD - NIGHT' },
      ]),
    ])
    expect(r.kept).toHaveLength(0)
    expect(r.d['single-evidence']).toBe(1)
  })

  test('7. two real typos on one line both survive; the same typo twice is still deduped', () => {
    const src = 'INT. A - DAY\n\nI recieve teh thing.\n'
    const both = run(src, [spell(3, 'recieve', 'receive'), spell(3, 'teh', 'the')])
    expect(both.kept).toHaveLength(2)
    expect(run(src, [spell(3, 'teh', 'the'), spell(3, 'teh', 'the')]).d.duplicate).toBe(1)
  })
})

describe('proofread store (item 8)', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })

  async function setup(apiKey: string, call?: () => Promise<unknown>) {
    vi.doMock('../src/lib/proofread', async (orig) => ({
      ...(await orig<typeof import('../src/lib/proofread')>()),
      runProofreadInApp: call ?? vi.fn(),
    }))
    const { useProofreadStore } = await import('../src/store/proofread-store')
    const { useAIStore: ai } = await import('../src/store/ai-store')
    const { useEditorStore: ed } = await import('../src/store/editor-store')
    ai.setState({ apiKeys: { anthropic: apiKey, openai: '', google: '' } })
    ed.getState().openFile('t.fountain', 'INT. ROOM\n\nHe sits.\n', undefined, 'doc-1')
    return { useProofreadStore }
  }

  test('no key: AI tier is skipped, rule checks are shown, message is plain', async () => {
    const call = vi.fn()
    const { useProofreadStore } = await setup('', call)
    await useProofreadStore.getState().run()
    const s = useProofreadStore.getState()
    expect(call).not.toHaveBeenCalled()
    expect(s.error).toBe(
      'AI proofreading needs your Anthropic API key (Settings) or a Coil tester token. Rule checks below ran without it.',
    )
    expect(s.result?.findings.length).toBeGreaterThan(0)
    expect(s.result?.findings.every((f) => f.source === 'tier0')).toBe(true)
    expect(s.resultDocId).toBe('doc-1')
  })

  const failed = (status: number | null, firstError: string) => async () => {
    const mod = await vi.importActual<typeof import('../src/lib/proofread')>('../src/lib/proofread')
    return {
      ...mod.runTier0Only('INT. ROOM\n\nHe sits.\n'),
      chunks: 2,
      failedChunks: 2,
      firstError,
      firstErrorStatus: status,
    }
  }

  test.each([
    [401, /needs your Anthropic API key/],
    [404, /isn't reachable from this build/],
    [0, /You're offline; rule checks still ran/],
    [429, /Rate-limited; try again in a minute/],
    [500, /The check failed: boom/],
  ])('AI failure %s keeps the rule findings and maps the error', async (status, pattern) => {
    const { useProofreadStore } = await setup('sk-ant-x', failed(status, 'boom'))
    await useProofreadStore.getState().run()
    const s = useProofreadStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toMatch(pattern)
    expect(s.result?.findings.length).toBeGreaterThan(0)
    expect(s.resultDocId).toBe('doc-1')
  })
})

describe('find panel (item 9)', () => {
  test('Close is in a row, not an absolutely positioned overlay', () => {
    type Fake = { tag: string; children: Fake[]; cls: Set<string>; attrs: Record<string, string>; [k: string]: unknown }
    const make = (tag: string): Fake => {
      const n: Fake = { tag, children: [], cls: new Set(), attrs: {} }
      n.setAttribute = (k: string, v: string) => {
        n.attrs[k] = v
        if (k === 'class') for (const c of v.split(' ')) n.cls.add(c)
      }
      n.append = (...kids: Fake[]) => n.children.push(...kids)
      n.addEventListener = () => {}
      n.focus = () => {}
      n.select = () => {}
      n.classList = { add: (c: string) => n.cls.add(c) }
      return n
    }
    vi.stubGlobal('document', { createElement: make })
    const view = { state: EditorState.create({ doc: 'abc' }), dispatch: () => {} }
    const panel = createFindPanel(view as never)
    vi.unstubAllGlobals()
    const root = panel.dom as unknown as Fake
    expect(root.children.every((c) => c.cls.has('coil-find-row'))).toBe(true)
    const rows = root.children
    const closeRow = rows.find((r) => r.children.some((c) => c.cls.has('coil-find-close')))
    expect(closeRow).toBeDefined()
    expect(closeRow).not.toBe(rows[0]) // not in the row that holds the Regex toggle
    const css = readFileSync('src/styles/globals.css', 'utf8')
    const rule = css.match(/\.coil-find-close\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule).not.toMatch(/position:\s*absolute/)
    expect(css.match(/body \.cm-panels \.coil-find \{[^}]*\}/)?.[0]).not.toMatch(/48px/)
  })
})
