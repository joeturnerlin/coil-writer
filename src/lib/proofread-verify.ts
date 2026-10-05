import { editDistance, findingId, nameKey } from './proofread-tier0'
import {
  type AICategory,
  AI_CATEGORIES,
  type DropCounts,
  type DropReason,
  type ProofreadFinding,
  type RawEvidence,
  type VerifiedEvidence,
} from './proofread-types'
/**
 * Proofreader Tier 2 — the verifier. A pure function and the heart of trust: no AI finding is shown
 * unless every piece of its evidence is machine-checked against the CURRENT text. Failures are
 * dropped and counted, never repaired or relocated.
 */
import { type ScriptIndex, textAtLines } from './script-index'

export interface VerifyContext {
  index: ScriptIndex
  source: string
  /** Inclusive one-based line range of the chunk the model was shown. */
  range: [number, number]
}

export const normWS = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Roster name keys: full names, aliases, and each name part (so "Marcus" matches MARCUS WELLS). */
export function rosterKeys(index: ScriptIndex): Set<string> {
  const keys = new Set<string>()
  for (const c of index.characters) {
    for (const n of [c.name, ...c.aliases]) {
      const full = nameKey(n)
      if (full) keys.add(full)
      for (const part of n.split(/[\s.]+/)) {
        const k = nameKey(part)
        if (k.length >= 2) keys.add(k)
      }
    }
  }
  return keys
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whole-word occurrences of `quote` in `text` (the same lookaround applyTarget uses for Apply). */
const wholeWordRe = (quote: string, letters = '\\p{L}') =>
  new RegExp(`(?<![${letters}])${escapeRe(quote)}(?![${letters}])`, 'gu')
const TOKEN_RE = /^[\p{L}][\p{L}'’-]*$/u

function countWord(source: string, token: string): number {
  const re = new RegExp(`(?<![\\p{L}])${escapeRe(token)}(?![\\p{L}])`, 'giu')
  return (source.match(re) ?? []).length
}

function parseEvidence(v: unknown): RawEvidence[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 8) return null
  const out: RawEvidence[] = []
  for (const e of v) {
    const line = (e as RawEvidence | null)?.line
    const quote = (e as RawEvidence | null)?.quote
    if (typeof line !== 'number' || !Number.isInteger(line) || typeof quote !== 'string' || !normWS(quote)) return null
    out.push({ line, quote })
  }
  return out
}

/**
 * Verify one chunk's worth of raw model findings. `drops` is mutated (counts by reason).
 * `seen` carries dedupe keys across chunks.
 */
export function verifyFindings(
  raw: unknown,
  ctx: VerifyContext,
  drops: DropCounts,
  seen: Set<string> = new Set(),
): ProofreadFinding[] {
  const list = Array.isArray(raw) ? raw : []
  const roster = rosterKeys(ctx.index)
  const out: ProofreadFinding[] = []
  const drop = (r: DropReason) => {
    drops[r]++
  }
  const lineText = (n: number) => textAtLines(ctx.index, ctx.source, n, n)
  const total = ctx.index.lineStarts.length

  for (const item of list) {
    const f = item as Record<string, unknown> | null
    if (!f || typeof f !== 'object') {
      drop('schema')
      continue
    }
    const evidence = parseEvidence(f.evidence)
    if (
      typeof f.category !== 'string' ||
      typeof f.claim !== 'string' ||
      !normWS(f.claim) ||
      !evidence ||
      (f.suggestion !== undefined && f.suggestion !== null && typeof f.suggestion !== 'string')
    ) {
      drop('schema')
      continue
    }
    if (!AI_CATEGORIES.includes(f.category as AICategory)) {
      drop('category')
      continue
    }
    const category = f.category as AICategory
    const suggestion = typeof f.suggestion === 'string' && normWS(f.suggestion) ? normWS(f.suggestion) : undefined

    if (evidence.some((e) => e.line < ctx.range[0] || e.line > ctx.range[1] || e.line < 1 || e.line > total)) {
      drop('line-out-of-range')
      continue
    }

    // Each quote must sit on the cited line, or (models are often off by one) uniquely on the line either side
    // inside this chunk. The ACTUAL line is what we store, so jump, Apply and staleness all use the real one.
    // spelling / wrong-name need a whole-word match; the free-text categories need real words, not fragments.
    const exact = category === 'spelling' || category === 'wrong-name'
    const letters = exact ? '\\p{L}' : '\\p{L}\\p{N}'
    const verified: VerifiedEvidence[] = []
    let quotesOk = true
    for (const e of evidence) {
      const q = normWS(e.quote)
      if (!exact && (q.replace(/\s/g, '').length < 4 || !/[\p{L}\p{N}]/u.test(q))) {
        quotesOk = false
        break
      }
      const has = (n: number) => wholeWordRe(q, letters).test(normWS(lineText(n)))
      let actual: number | null = has(e.line) ? e.line : null
      if (actual === null) {
        const hits = [e.line - 1, e.line + 1].filter(
          (n) => n >= ctx.range[0] && n <= ctx.range[1] && n >= 1 && n <= total && has(n),
        )
        if (hits.length === 1) actual = hits[0]
      }
      if (actual === null) {
        quotesOk = false
        break
      }
      verified.push({ line: actual, quote: q, lineText: lineText(actual) })
    }
    if (!quotesOk) {
      drop('quote-not-found')
      continue
    }

    if (category === 'spelling') {
      // Models often quote the whole line. Narrow a verified phrase to the ONE word that is a near-miss of the
      // suggested correction (e.g. 'monuted' for 'mounted'); zero or several candidates = drop. Still deterministic.
      if (suggestion && TOKEN_RE.test(suggestion) && !TOKEN_RE.test(verified[0].quote)) {
        const words = verified[0].quote.match(/[\p{L}][\p{L}'’-]*/gu) ?? []
        const near = [...new Set(words)].filter(
          (w) => w !== suggestion && editDistance(w.toLowerCase(), suggestion.toLowerCase()) <= 2,
        )
        if (near.length === 1) verified[0] = { ...verified[0], quote: near[0] }
      }
      const tok = verified[0].quote
      if (
        !suggestion ||
        suggestion === tok ||
        !TOKEN_RE.test(tok) ||
        roster.has(nameKey(tok)) ||
        countWord(ctx.source, tok) - 1 >= 2
      ) {
        drop('spelling-rule')
        continue
      }
    } else if (category === 'wrong-name') {
      if (!roster.has(nameKey(verified[0].quote)) || (suggestion && suggestion === verified[0].quote)) {
        drop('name-rule')
        continue
      }
    } else if (new Set(verified.map((e) => e.line)).size < 2) {
      drop('single-evidence')
      continue
    }

    const dedupe = `${category}|${verified
      .map((e) => `${e.line}:${e.quote}`)
      .sort()
      .join('|')}`
    if (seen.has(dedupe)) {
      drop('duplicate')
      continue
    }
    seen.add(dedupe)

    out.push({
      id: findingId(category, verified),
      category,
      source: 'ai',
      severity: 'warning',
      claim: normWS(f.claim),
      ...(suggestion ? { suggestion } : {}),
      evidence: verified,
      revisionHash: ctx.index.revisionHash,
    })
  }
  return out
}

/** A finding is stale when any cited line no longer has the text it was verified against. */
export function isStale(f: ProofreadFinding, currentLines: string[]): boolean {
  return f.evidence.some((e) => (currentLines[e.line - 1] ?? '').replace(/\r$/, '') !== e.lineText)
}

/** Where a one-click Apply would write, or null when it must not be offered. Checked against the current doc lines. */
export function applyTarget(
  f: ProofreadFinding,
  currentLines: string[],
): { line: number; start: number; end: number; replacement: string } | null {
  if (f.source !== 'ai' || (f.category !== 'spelling' && f.category !== 'wrong-name')) return null
  const repl = f.suggestion
  const ev = f.evidence[0]
  if (!repl || !ev || /\s/.test(repl) || /\s/.test(ev.quote) || repl === ev.quote) return null
  const text = (currentLines[ev.line - 1] ?? '').replace(/\r$/, '')
  if (text !== ev.lineText) return null
  const re = new RegExp(`(?<![\\p{L}])${escapeRe(ev.quote)}(?![\\p{L}])`, 'gu')
  const hits = [...text.matchAll(re)]
  if (hits.length !== 1) return null
  const start = hits[0].index ?? 0
  return { line: ev.line, start, end: start + ev.quote.length, replacement: repl }
}
