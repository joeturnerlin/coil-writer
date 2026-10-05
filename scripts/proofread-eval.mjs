#!/usr/bin/env node
/**
 * Proofreader calibration eval (NOT run in tests; spends real money).
 *
 *   COIL_EVAL_ANTHROPIC_KEY=sk-ant-... node scripts/proofread-eval.mjs path/to/clean.fountain [N=8] [SEED=1] [MODEL]
 *
 * Takes a CLEAN Fountain file, injects N objective defects with a seeded RNG
 * (cue-name typo, slug DAY<->NIGHT flip in a scene whose action has a sun/moon word,
 * misspelled common word in action, wrong-name substitution in dialogue address),
 * runs the real pipeline (src/lib/proofread-core.ts) against Anthropic, and prints
 * recall per category, precision, false findings on the UNMODIFIED file, and total tokens/cost.
 * Model defaults to PROOFREAD_MODEL from src/lib/models.ts.
 */
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [file, nArg, seedArg, modelArg] = process.argv.slice(2)
const key = process.env.COIL_EVAL_ANTHROPIC_KEY
if (!file || !key) {
  console.error('usage: COIL_EVAL_ANTHROPIC_KEY=... node scripts/proofread-eval.mjs <clean.fountain> [N] [SEED] [MODEL]')
  process.exit(2)
}
const N = Number(nArg ?? 8)
let seed = Number(seedArg ?? 1)
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
const pick = (a) => a[Math.floor(rng() * a.length)]

// Bundle the TS pipeline (no app stores) into a temp ESM file.
const root = resolve(import.meta.dirname, '..')
const tmp = mkdtempSync(join(tmpdir(), 'coil-eval-'))
const out = join(tmp, 'pipeline.mjs')
await build({
  stdin: {
    contents: `export * from './src/lib/proofread-core'; export * from './src/lib/script-index'; export { PROOFREAD_MODEL, MODEL_PRICES } from './src/lib/models'`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
})
const P = await import(pathToFileURL(out).href)
const model = modelArg ?? P.PROOFREAD_MODEL

const call = async ({ systemPrompt, userPrompt, maxTokens, signal }) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data)}`)
  return {
    text: data.content?.[0]?.text ?? '',
    usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
  }
}

const clean = readFileSync(file, 'utf8')
const lines = clean.split('\n')
const ix = P.buildScriptIndex(clean)

// ---- defect injectors: each mutates `lines` and returns {category, line, note} or null ----
const used = new Set()
const free = (n) => !used.has(n) && !used.has(n - 1) && !used.has(n + 1)
const defects = []
const typo = (w) => (w.length > 4 ? w.slice(0, 2) + w[3] + w[2] + w.slice(4) : null)
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase()

const injectors = {
  'wrong-name': () => {
    const speakers = ix.characters.filter((c) => c.lineCount >= 3)
    if (speakers.length < 3) return null
    const cand = []
    for (const sc of ix.scenes)
      for (const el of sc.elements)
        if (el.kind === 'dialogue') for (let ln = el.lineStart; ln <= el.lineEnd; ln++) cand.push({ ln, sp: el.speaker })
    for (let t = 0; t < 300 && cand.length; t++) {
      const c = pick(cand)
      if (!free(c.ln)) continue
      for (const ch of speakers) {
        const first = ch.name.split(' ')[0]
        const re = new RegExp(`\\b${cap(first)}\\b`)
        if (!re.test(lines[c.ln - 1]) || ch.name === c.sp) continue
        const other = pick(speakers.filter((s) => s.name !== ch.name && s.name !== c.sp))
        if (!other) continue
        const to = cap(other.name.split(' ')[0])
        const was = lines[c.ln - 1].match(re)[0]
        lines[c.ln - 1] = lines[c.ln - 1].replace(re, to)
        return { category: 'wrong-name', line: c.ln, note: `${was} -> ${to}` }
      }
    }
    return null
  },
  spelling: () => {
    const cand = []
    for (const sc of ix.scenes)
      for (const el of sc.elements)
        if (el.kind === 'action') for (let ln = el.lineStart; ln <= el.lineEnd; ln++) cand.push(ln)
    for (let t = 0; t < 300 && cand.length; t++) {
      const ln = pick(cand)
      if (!free(ln)) continue
      const words = lines[ln - 1].match(/\b[a-z]{6,}\b/g)
      if (!words) continue
      const w = pick(words)
      const bad = typo(w)
      if (!bad || bad === w) continue
      lines[ln - 1] = lines[ln - 1].replace(new RegExp(`\\b${w}\\b`), bad)
      return { category: 'spelling', line: ln, note: `${w} -> ${bad}` }
    }
    return null
  },
  'day-night': () => {
    const sunmoon = /\b(sunlight|sunrise|sunshine|moonlight|moonlit|stars overhead)\b/i
    const cand = ix.scenes.filter(
      (s) =>
        ['DAY', 'NIGHT'].includes(s.timeOfDay) &&
        free(s.headingLine) &&
        s.elements.some((e) => e.kind === 'action' && sunmoon.test(e.text)),
    )
    if (!cand.length) return null
    const s = pick(cand)
    const from = s.timeOfDay
    const to = from === 'DAY' ? 'NIGHT' : 'DAY'
    lines[s.headingLine - 1] = lines[s.headingLine - 1].replace(new RegExp(from, 'i'), to)
    return { category: 'day-night', line: s.headingLine, note: `${from} -> ${to}` }
  },
  'cue-typo': () => {
    const cand = []
    for (const sc of ix.scenes) for (const el of sc.elements) if (el.kind === 'cue') cand.push(el.lineStart)
    for (let t = 0; t < 300 && cand.length; t++) {
      const ln = pick(cand)
      if (!free(ln)) continue
      const m = /^(\s*)([A-Z][A-Z' -]{3,})(.*)$/.exec(lines[ln - 1])
      if (!m) continue
      const bad = typo(m[2].trim())
      if (!bad) continue
      lines[ln - 1] = `${m[1]}${bad}${m[3]}`
      return { category: 'cue-typo', line: ln, note: `${m[2].trim()} -> ${bad}` }
    }
    return null
  },
}
const kinds = Object.keys(injectors)
for (let i = 0; i < N; i++) {
  const d = injectors[kinds[i % kinds.length]]()
  if (d) {
    used.add(d.line)
    defects.push(d)
  }
}
const injected = lines.join('\n')

const price = P.MODEL_PRICES[model]
const cost = (u) => (price ? (u.inputTokens * price.inputPerM + u.outputTokens * price.outputPerM) / 1e6 : null)

console.log(`model ${model}; ${defects.length}/${N} defects injected (seed ${seedArg ?? 1})`)
for (const d of defects) console.log(`  [${d.category}] L${d.line} ${d.note}`)
const base = await P.runProofread({ source: clean, call })
const mod = await P.runProofread({ source: injected, call })

// A finding "hits" a defect when it cites the defect line (+-1). Tier 0 findings count (cue-typo is Tier 0's job).
const hit = (f, d) => f.evidence.some((e) => Math.abs(e.line - d.line) <= 1)
const byCat = {}
for (const d of defects) {
  const c = (byCat[d.category] ??= { n: 0, found: 0 })
  c.n++
  if (mod.findings.some((f) => hit(f, d))) c.found++
}
const tp = mod.findings.filter((f) => defects.some((d) => hit(f, d))).length
console.log('\nRECALL by category (any finding citing the defect line)')
for (const [c, v] of Object.entries(byCat)) console.log(`  ${c.padEnd(12)} ${v.found}/${v.n}`)
console.log(
  `\nPRECISION on injected file: ${tp}/${mod.findings.length} findings hit an injected defect (others need human triage; some may be genuine issues already in the source)`,
)
console.log(`\nFALSE FINDINGS on UNMODIFIED file: ${base.findings.length}`)
for (const f of base.findings) console.log(`  [${f.category}${f.severity === 'note' ? '/note' : ''}] L${f.evidence[0].line} ${f.claim}`)
console.log(`\nVERIFIER dropped (injected run): ${JSON.stringify(mod.dropped)}`)
console.log(`failed chunks: clean ${base.failedChunks}, injected ${mod.failedChunks}`)
const u = {
  inputTokens: base.usage.inputTokens + mod.usage.inputTokens,
  outputTokens: base.usage.outputTokens + mod.usage.outputTokens,
}
console.log(`\nTOKENS in ${u.inputTokens} out ${u.outputTokens}; cost ${cost(u) === null ? 'unknown (no price)' : `$${cost(u).toFixed(3)}`} (both runs)`)
rmSync(tmp, { recursive: true, force: true })
