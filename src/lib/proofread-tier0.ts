import type { ProofreadFinding, Tier0Category } from './proofread-types'
/**
 * Proofreader Tier 0 — deterministic observations from the ScriptIndex. No AI, no re-parsing of Fountain.
 *
 * Known limit (inherited from the editor's classifyDocument): a cue containing a hyphen or accent
 * (JEAN-LUC, RENÉE) is not recognised as a cue unless forced with "@", so it never reaches the roster.
 * Name comparison therefore normalises accents/punctuation/spacing, which makes "@JEAN-LUC" and
 * "JEAN LUC" compare equal, but a non-forced hyphenated cue is invisible to this check.
 */
import { type IndexCharacter, type IndexScene, type ScriptIndex, type TimeOfDay, textAtLines } from './script-index'

/** Closed word lists (whole-word, case-insensitive). Deliberately small: every entry is a near-certain contradiction. */
const DAY_WORDS = ['sunlight', 'midday sun', 'sunrise', 'sunshine', 'noonday sun', 'broad daylight']
const NIGHT_WORDS = ['moonlight', 'moonlit', 'pitch dark', 'pitch black', 'stars overhead', 'starry sky']

const DAYISH: ReadonlySet<TimeOfDay> = new Set(['DAY', 'MORNING', 'AFTERNOON'])
const NIGHTISH: ReadonlySet<TimeOfDay> = new Set(['NIGHT', 'EVENING'])

export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function findingId(category: string, evidence: { line: number; quote: string }[], claim = ''): string {
  return hashString(`${category}|${evidence.map((e) => `${e.line}:${e.quote}`).join('|')}|${claim}`)
}

/** Accents, punctuation and spacing removed; uppercase. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Both names have at least this many cues => two distinct roster members, reported as a note. */
const ROSTER_CUE_FLOOR = 4

export function lineOf(index: ScriptIndex, source: string, line: number): string {
  return textAtLines(index, source, line, line)
}

function mk(
  index: ScriptIndex,
  source: string,
  category: Tier0Category,
  severity: 'warning' | 'note',
  claim: string,
  ev: { line: number; quote: string }[],
): ProofreadFinding {
  return {
    id: findingId(category, ev, claim),
    category,
    source: 'tier0',
    severity,
    claim,
    evidence: ev.map((e) => ({ ...e, lineText: lineOf(index, source, e.line) })),
    revisionHash: index.revisionHash,
  }
}

function nameVariants(index: ScriptIndex, source: string, out: ProofreadFinding[]) {
  const chars = index.characters
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i]
      const b = chars[j]
      const ka = nameKey(a.name)
      const kb = nameKey(b.name)
      if (!ka || !kb) continue
      const short = Math.min(ka.length, kb.length)
      const limit = short <= 4 ? 1 : 2
      if (ka !== kb && editDistance(ka, kb) > limit) continue
      const [major, minor]: [IndexCharacter, IndexCharacter] = a.cueCount >= b.cueCount ? [a, b] : [b, a]
      const counts = `${major.name} (${major.lineCount} lines) vs ${minor.name} (${minor.lineCount} lines)`
      const distinct = ka !== kb && minor.cueCount >= ROSTER_CUE_FLOOR
      out.push(
        mk(
          index,
          source,
          'name-variant',
          distinct ? 'note' : 'warning',
          distinct
            ? `Similar character names, both with many lines: ${counts}. Informational only.`
            : `Possible misspelled character cue: ${counts}.`,
          [major, minor].map((c) => ({ line: c.firstLine, quote: lineOf(index, source, c.firstLine).trim() })),
        ),
      )
    }
  }
}

function sluglines(index: ScriptIndex, source: string, out: ProofreadFinding[]) {
  for (const s of index.scenes) {
    if (s.timeOfDay !== 'UNKNOWN') continue
    out.push(
      mk(index, source, 'slugline', 'warning', 'Scene heading has no recognised time of day (e.g. DAY, NIGHT).', [
        { line: s.headingLine, quote: s.rawHeading.trim() },
      ]),
    )
  }
}

function wordRe(w: string): RegExp {
  return new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i')
}

function timeCues(index: ScriptIndex, source: string, out: ProofreadFinding[]) {
  for (const s of index.scenes) {
    const t = s.timeOfDay
    const words = t === 'NIGHT' ? DAY_WORDS : DAYISH.has(t) ? NIGHT_WORDS : null
    if (!words) continue
    for (const el of s.elements) {
      if (el.kind !== 'action') continue
      for (let ln = el.lineStart; ln <= el.lineEnd; ln++) {
        const text = lineOf(index, source, ln)
        for (const w of words) {
          const m = wordRe(w).exec(text)
          if (!m) continue
          out.push(
            mk(index, source, 'time-cue', 'warning', `Action says "${m[0]}" in a ${s.timeRaw ?? t} scene.`, [
              { line: s.headingLine, quote: s.rawHeading.trim() },
              { line: ln, quote: m[0] },
            ]),
          )
        }
      }
    }
  }
}

function group(t: TimeOfDay): 'day' | 'night' | null {
  return DAYISH.has(t) ? 'day' : NIGHTISH.has(t) ? 'night' : null
}

function continuousAfterJump(index: ScriptIndex, source: string, out: ProofreadFinding[]) {
  const sc: IndexScene[] = index.scenes
  for (let i = 2; i < sc.length; i++) {
    if (sc[i].timeOfDay !== 'CONTINUOUS') continue
    const g1 = group(sc[i - 1].timeOfDay)
    const g0 = group(sc[i - 2].timeOfDay)
    if (!g0 || !g1 || g0 === g1) continue
    out.push(
      mk(
        index,
        source,
        'continuous-after-jump',
        'warning',
        `CONTINUOUS follows a time change (${sc[i - 2].timeRaw} to ${sc[i - 1].timeRaw}); confirm which scene it continues.`,
        [
          { line: sc[i - 1].headingLine, quote: sc[i - 1].rawHeading.trim() },
          { line: sc[i].headingLine, quote: sc[i].rawHeading.trim() },
        ],
      ),
    )
  }
}

export function runTier0(index: ScriptIndex, source: string): ProofreadFinding[] {
  const out: ProofreadFinding[] = []
  nameVariants(index, source, out)
  sluglines(index, source, out)
  timeCues(index, source, out)
  continuousAfterJump(index, source, out)
  return out
}
