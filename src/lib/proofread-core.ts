/**
 * Proofreader pipeline core: chunking, prompts, concurrency, verification. Pure apart from the injected
 * `call` function, so tests and scripts/proofread-eval.mjs can run it without the app's stores.
 */
import { parseJsonLoose } from './json-parse'
import { runTier0 } from './proofread-tier0'
import { type DropCounts, type ProofreadFinding, emptyDropCounts } from './proofread-types'
import { verifyFindings } from './proofread-verify'
import { type ScriptIndex, buildScriptIndex, textAtLines } from './script-index'

/** ~6k tokens of script per chunk at ~4 chars/token. */
// ~9k chars keeps one chunk's request well under the hosted 60 s limit (24k chunks took >27 s on The Hike)
export const CHUNK_TARGET_CHARS = 9_000
export const PROOFREAD_CONCURRENCY = 2
export const PROOFREAD_MAX_TOKENS = 4096

export interface Chunk {
  /** inclusive one-based line range shown to the model */
  lo: number
  hi: number
  text: string
}

export const estimateTokens = (chars: number): number => Math.ceil(chars / 4)

function numbered(index: ScriptIndex, source: string, lo: number, hi: number): string {
  const out: string[] = []
  for (let n = lo; n <= hi; n++) {
    const t = textAtLines(index, source, n, n)
    if (t.trim()) out.push(`${n}: ${t}`)
  }
  return out.join('\n')
}

/** Group whole scenes into chunks of about CHUNK_TARGET_CHARS; a single oversized scene is split on line boundaries. */
export function chunkScript(index: ScriptIndex, source: string): Chunk[] {
  const totalLines = index.lineStarts.length
  const spans: [number, number][] = index.scenes.map((s) => [s.lineStart, s.lineEnd])
  if (spans.length === 0) spans.push([1, totalLines])
  else spans[0][0] = 1 // title page / preamble ride with the first scene
  const chunks: Chunk[] = []
  let lo = -1
  let hi = -1
  let size = 0
  const flush = () => {
    if (lo > 0) chunks.push({ lo, hi, text: numbered(index, source, lo, hi) })
    lo = -1
    size = 0
  }
  for (const [a, b] of spans) {
    const len = textAtLines(index, source, a, b).length
    if (len > CHUNK_TARGET_CHARS) {
      flush()
      let start = a
      let acc = 0
      for (let n = a; n <= b; n++) {
        acc += textAtLines(index, source, n, n).length + 1
        if (acc >= CHUNK_TARGET_CHARS || n === b) {
          chunks.push({ lo: start, hi: n, text: numbered(index, source, start, n) })
          start = n + 1
          acc = 0
        }
      }
      continue
    }
    if (lo > 0 && size + len > CHUNK_TARGET_CHARS) flush()
    if (lo < 0) lo = a
    hi = b
    size += len
  }
  flush()
  // Last chunk reaches the end of the document (trailing lines after the last scene).
  if (chunks.length) chunks[chunks.length - 1].hi = Math.max(chunks[chunks.length - 1].hi, totalLines)
  return chunks.filter((c) => c.text.trim())
}

export const SYSTEM_PROMPT = `You are a meticulous screenplay proofreader. You find OBJECTIVE errors only. You never give taste notes, style advice, or suggestions about quality. A script with no errors is common: returning {"findings":[]} is correct and good.

You are shown one chunk of a script. Every line is prefixed "N: " with its line number. You are also given facts computed from the whole script: the character roster (with line counts and aliases) and the slugline table for ALL scenes.

Report only these categories:
- "spelling": a typo or misspelled word. NEVER flag roster names, or invented proper nouns (place names, brands, made-up words) that appear 2 or more times in the script.
- "wrong-name": a character name used where the context shows a different character is meant (someone addressed by the wrong name, an action line attributing a line or act to a character who is not present).
- "day-night": text inside a scene that contradicts its slugline time, or a timeline contradiction across scenes.
- "continuity-objective": an object or fact stated two incompatible ways (e.g. a red car, later a blue car, same car).

Rules:
- Every finding MUST cite evidence: {"line": N, "quote": "..."} where N is a line number shown and quote is copied EXACTLY, character for character, from that line. Never paraphrase a quote. Cite only lines in this chunk.
- "spelling" and "wrong-name": evidence[0].quote is ONLY the single word or name to change (not the whole line), exactly as written on that line. Put the corrected word in "suggestion" (one word).
- "day-night" and "continuity-objective": cite at least two evidence entries on different lines (for example the slugline and the contradicting line).
- If you are not certain, do not report it.

Report at most 20 findings, the most certain first, and keep each claim under 20 words (longer output is cut off and lost).
Respond with JSON only: {"findings":[{"category":"spelling|wrong-name|day-night|continuity-objective","claim":"one sentence","suggestion":"optional","evidence":[{"line":12,"quote":"exact text"}]}]}`

export function factsBlock(index: ScriptIndex): string {
  const roster = [...index.characters]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 80)
    .map((c) => `${c.name} (${c.lineCount} lines${c.aliases.length ? `; also written ${c.aliases.join(', ')}` : ''})`)
    .join('\n')
  const slugs = index.scenes
    .map((s) => `${s.index + 1} | line ${s.headingLine} | ${s.intExt} | ${s.location} | ${s.timeRaw ?? 'no time'}`)
    .join('\n')
  return `ROSTER\n${roster || '(none)'}\n\nSLUGLINES (scene | line | INT/EXT | location | time)\n${slugs || '(none)'}`
}

export function userPrompt(index: ScriptIndex, chunk: Chunk): string {
  return `${factsBlock(index)}\n\nSCRIPT CHUNK (lines ${chunk.lo}-${chunk.hi})\n${chunk.text}`
}

export interface CostEstimate {
  chunks: number
  inputTokens: number
  outputTokens: number
}

/** Pre-run estimate: per-chunk script + facts + system prompt in; ~300 tokens out per chunk. */
export function estimateRun(source: string): CostEstimate {
  const index = buildScriptIndex(source)
  const chunks = chunkScript(index, source)
  const per = estimateTokens(SYSTEM_PROMPT.length + factsBlock(index).length)
  return {
    chunks: chunks.length,
    inputTokens: chunks.reduce((n, c) => n + per + estimateTokens(c.text.length), 0),
    outputTokens: chunks.length * 300,
  }
}

export type ModelCall = (args: {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  signal?: AbortSignal
}) => Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>

export interface ProofreadResult {
  revisionHash: string
  scenes: number
  chunks: number
  /** Chunks whose response was an error or not valid findings JSON (NOT the same as "no issues"). */
  failedChunks: number
  firstError: string | null
  /** HTTP status of the first failed chunk's error, when it had one (0 = network). */
  firstErrorStatus: number | null
  findings: ProofreadFinding[]
  dropped: DropCounts
  usage: { inputTokens: number; outputTokens: number }
}

export async function runProofread(opts: {
  source: string
  call: ModelCall
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  concurrency?: number
}): Promise<ProofreadResult> {
  const { source, call, signal, onProgress } = opts
  const index = buildScriptIndex(source)
  const chunks = chunkScript(index, source)
  const dropped = emptyDropCounts()
  const seen = new Set<string>()
  const ai: ProofreadFinding[] = []
  const usage = { inputTokens: 0, outputTokens: 0 }
  let failed = 0
  let firstError: string | null = null
  let firstErrorStatus: number | null = null
  let done = 0
  let next = 0
  onProgress?.(0, chunks.length)

  const worker = async () => {
    while (next < chunks.length) {
      if (signal?.aborted) return
      const chunk = chunks[next++]
      try {
        const res = await call({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: userPrompt(index, chunk),
          maxTokens: PROOFREAD_MAX_TOKENS,
          signal,
        })
        if (res.usage) {
          usage.inputTokens += res.usage.inputTokens
          usage.outputTokens += res.usage.outputTokens
        }
        const parsed = parseJsonLoose<{ findings?: unknown }>(res.text, 'proofread')
        if (!parsed || !Array.isArray(parsed.findings))
          throw new Error('Invalid proofread response (no findings array)')
        ai.push(...verifyFindings(parsed.findings, { index, source, range: [chunk.lo, chunk.hi] }, dropped, seen))
      } catch (err) {
        if (signal?.aborted) return
        failed++
        if (firstError === null) {
          firstError = err instanceof Error ? err.message : String(err)
          const status = (err as { status?: unknown } | null)?.status
          firstErrorStatus = typeof status === 'number' ? status : null
        }
      }
      onProgress?.(++done, chunks.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? PROOFREAD_CONCURRENCY, chunks.length) }, worker))
  if (signal?.aborted) throw new DOMException('Proofread cancelled', 'AbortError')

  const findings = [...runTier0(index, source), ...ai].sort((a, b) => a.evidence[0].line - b.evidence[0].line)
  return {
    revisionHash: index.revisionHash,
    scenes: index.scenes.length,
    chunks: chunks.length,
    failedChunks: failed,
    firstError,
    firstErrorStatus,
    findings,
    dropped,
    usage,
  }
}

/** Rule checks (Tier 0) only: the result when the AI tier is skipped. No chunks were sent, so none failed. */
export function runTier0Only(source: string): ProofreadResult {
  const index = buildScriptIndex(source)
  const findings = runTier0(index, source).sort((a, b) => a.evidence[0].line - b.evidence[0].line)
  return {
    revisionHash: index.revisionHash,
    scenes: index.scenes.length,
    chunks: 0,
    failedChunks: 0,
    firstError: null,
    firstErrorStatus: null,
    findings,
    dropped: emptyDropCounts(),
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}
