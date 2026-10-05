import { findingId, nameKey } from './proofread-tier0'
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

    // Quote must sit in the cited line or the line either side (models are often off by one).
    const verified: VerifiedEvidence[] = []
    let quotesOk = true
    for (const e of evidence) {
      const q = normWS(e.quote)
      const near = [e.line - 1, e.line, e.line + 1].filter((n) => n >= 1 && n <= total)
      if (!near.some((n) => normWS(lineText(n)).includes(q))) {
        quotesOk = false
        break
      }
      verified.push({ line: e.line, quote: q, lineText: lineText(e.line) })
    }
    if (!quotesOk) {
      drop('quote-not-found')
      continue
    }

    if (category === 'spelling') {
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

    const dedupe = `${category}|${[...new Set(verified.map((e) => e.line))].sort((a, b) => a - b).join(',')}`
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
