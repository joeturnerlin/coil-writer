import { describe, expect, it } from 'vitest'
import { chunkScript, runProofread } from '../src/lib/proofread-core'
import { emptyDropCounts } from '../src/lib/proofread-types'
import { applyTarget, isStale, verifyFindings } from '../src/lib/proofread-verify'
import { buildScriptIndex } from '../src/lib/script-index'

const SRC = [
  'INT. KITCHEN - NIGHT', // 1
  '', // 2
  'Marcus pours a coffee and waits for the recieve.', // 3
  '', // 4
  'MARCUS', // 5
  'Where were you, Ann?', // 6
  '', // 7
  'ANN', // 8
  'Out.', // 9
  '', // 10
  'EXT. YARD - DAY', // 11
  '', // 12
  'Bright sun on the grass. A red car sits in the drive.', // 13
  '', // 14
  'The blue car is gone.', // 15
  '',
].join('\n')

const index = buildScriptIndex(SRC)
const ctx = { index, source: SRC, range: [1, 16] as [number, number] }
const verify = (raw: unknown[]) => {
  const d = emptyDropCounts()
  return { kept: verifyFindings(raw, ctx, d), d }
}

const spelling = {
  category: 'spelling',
  claim: 'Typo',
  suggestion: 'receiver',
  evidence: [{ line: 3, quote: 'recieve' }],
}

describe('verifier', () => {
  it('keeps a valid spelling finding', () => {
    const { kept, d } = verify([spelling])
    expect(kept).toHaveLength(1)
    expect(kept[0].evidence[0].lineText).toBe('Marcus pours a coffee and waits for the recieve.')
    expect(Object.values(d).every((n) => n === 0)).toBe(true)
  })

  it('drops a fabricated quote', () => {
    const { kept, d } = verify([{ ...spelling, evidence: [{ line: 3, quote: 'recieved' }] }])
    expect(kept).toHaveLength(0)
    expect(d['quote-not-found']).toBe(1)
  })

  it('drops a quote at the wrong line', () => {
    const { kept, d } = verify([{ ...spelling, evidence: [{ line: 9, quote: 'recieve' }] }])
    expect(kept).toHaveLength(0)
    expect(d['quote-not-found']).toBe(1)
  })

  it('tolerates a one-line offset', () => {
    expect(verify([{ ...spelling, evidence: [{ line: 4, quote: 'recieve' }] }]).kept).toHaveLength(1)
  })

  it('drops an out-of-range line', () => {
    const d = emptyDropCounts()
    const out = verifyFindings([spelling], { ...ctx, range: [10, 16] }, d)
    expect(out).toHaveLength(0)
    expect(d['line-out-of-range']).toBe(1)
  })

  it('drops a roster name flagged as spelling', () => {
    const { kept, d } = verify([
      { category: 'spelling', claim: 'x', suggestion: 'Marc', evidence: [{ line: 3, quote: 'Marcus' }] },
    ])
    expect(kept).toHaveLength(0)
    expect(d['spelling-rule']).toBe(1)
  })

  it('drops spelling without a differing suggestion', () => {
    expect(verify([{ ...spelling, suggestion: 'recieve' }]).kept).toHaveLength(0)
    expect(verify([{ ...spelling, suggestion: undefined }]).kept).toHaveLength(0)
  })

  it('drops a spelling flag on a word that appears 2+ times elsewhere', () => {
    const src = 'INT. A - DAY\n\nThe zorble sits. A zorble. Another zorble.\n'
    const ix = buildScriptIndex(src)
    const d = emptyDropCounts()
    const out = verifyFindings(
      [{ category: 'spelling', claim: 'x', suggestion: 'zombie', evidence: [{ line: 3, quote: 'zorble' }] }],
      { index: ix, source: src, range: [1, 4] },
      d,
    )
    expect(out).toHaveLength(0)
    expect(d['spelling-rule']).toBe(1)
  })

  it('drops a cross-scene claim with a single quote, keeps it with two', () => {
    const one = { category: 'continuity-objective', claim: 'car colour', evidence: [{ line: 13, quote: 'red car' }] }
    const two = {
      ...one,
      evidence: [
        { line: 13, quote: 'red car' },
        { line: 15, quote: 'blue car' },
      ],
    }
    const r1 = verify([one])
    expect(r1.kept).toHaveLength(0)
    expect(r1.d['single-evidence']).toBe(1)
    expect(verify([two]).kept).toHaveLength(1)
  })

  it('drops two quotes that cite the same line', () => {
    const same = {
      category: 'day-night',
      claim: 'x',
      evidence: [
        { line: 13, quote: 'Bright sun' },
        { line: 13, quote: 'red car' },
      ],
    }
    expect(verify([same]).kept).toHaveLength(0)
  })

  it('wrong-name requires a roster name', () => {
    const ok = {
      category: 'wrong-name',
      claim: 'Ann is addressed',
      suggestion: 'Ann',
      evidence: [{ line: 6, quote: 'Ann' }],
    }
    expect(verify([{ ...ok, suggestion: 'Eve', evidence: [{ line: 6, quote: 'Ann' }] }]).kept).toHaveLength(1)
    const bad = { ...ok, suggestion: 'Eve', evidence: [{ line: 6, quote: 'Where' }] }
    const r = verify([bad])
    expect(r.kept).toHaveLength(0)
    expect(r.d['name-rule']).toBe(1)
  })

  it('drops unknown categories and malformed findings, counting each', () => {
    const { kept, d } = verify([{ ...spelling, category: 'style' }, null, { category: 'spelling' }, 'x'])
    expect(kept).toHaveLength(0)
    expect(d.category).toBe(1)
    expect(d.schema).toBe(3)
  })

  it('dedupes same category and lines', () => {
    const { kept, d } = verify([spelling, { ...spelling, claim: 'Typo again' }])
    expect(kept).toHaveLength(1)
    expect(d.duplicate).toBe(1)
  })

  it('marks findings stale only when a cited line changed', () => {
    const f = verify([spelling]).kept[0]
    const lines = SRC.split('\n')
    expect(isStale(f, lines)).toBe(false)
    const edited = [...lines]
    edited[2] = 'Marcus pours a coffee.'
    expect(isStale(f, edited)).toBe(true)
    const other = [...lines]
    other[8] = 'Elsewhere.'
    expect(isStale(f, other)).toBe(false)
  })

  it('offers Apply only for a single-token fix at a unique verified location', () => {
    const f = verify([spelling]).kept[0]
    const lines = SRC.split('\n')
    expect(applyTarget(f, lines)).toEqual({ line: 3, start: 40, end: 47, replacement: 'receiver' })
    expect(applyTarget({ ...f, suggestion: 'a receiver' }, lines)).toBeNull()
    expect(applyTarget({ ...f, category: 'day-night' }, lines)).toBeNull()
    const edited = [...lines]
    edited[2] = 'changed'
    expect(applyTarget(f, edited)).toBeNull()
  })
})

describe('pipeline (stub model, no network)', () => {
  it('chunks whole scenes and verifies each chunk against its own range', async () => {
    const calls: string[] = []
    const res = await runProofread({
      source: SRC,
      call: async ({ userPrompt }) => {
        calls.push(userPrompt)
        return {
          text: JSON.stringify({ findings: [spelling, { ...spelling, evidence: [{ line: 3, quote: 'made up' }] }] }),
          usage: { inputTokens: 10, outputTokens: 5 },
        }
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('3: Marcus pours')
    expect(res.findings.filter((f) => f.source === 'ai')).toHaveLength(1)
    expect(res.dropped['quote-not-found']).toBe(1)
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  it('treats an invalid response as a failed chunk, not "no issues"', async () => {
    const res = await runProofread({ source: SRC, call: async () => ({ text: 'not json at all' }) })
    expect(res.failedChunks).toBe(res.chunks)
    expect(res.firstError).toBeTruthy()
    const empty = await runProofread({ source: SRC, call: async () => ({ text: '{"findings":[]}' }) })
    expect(empty.failedChunks).toBe(0)
  })

  it('splits large scripts into several chunks and reports progress', async () => {
    const scene = (i: number) => `INT. ROOM ${i} - DAY\n\n${'He waits quietly in the room. '.repeat(100)}\n`
    const big = Array.from({ length: 30 }, (_, i) => scene(i)).join('\n')
    const ix = buildScriptIndex(big)
    const chunks = chunkScript(ix, big)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].lo).toBe(1)
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].lo).toBe(chunks[i - 1].hi + 1)
    const seen: string[] = []
    await runProofread({
      source: big,
      call: async () => ({ text: '{"findings":[]}' }),
      onProgress: (d, t) => seen.push(`${d}/${t}`),
    })
    expect(seen.at(-1)).toBe(`${chunks.length}/${chunks.length}`)
  })

  it('can be cancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      runProofread({ source: SRC, call: async () => ({ text: '{"findings":[]}' }), signal: ac.signal }),
    ).rejects.toThrow()
  })
})
