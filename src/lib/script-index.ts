/**
 * ScriptIndex — a pure, deterministic structural projection of Fountain text.
 *
 * Fountain text is canonical; this index is a disposable derived cache. No AI, no DOM.
 * Line classification is delegated to the editor's own `classifyDocument`
 * (src/editor/fountain-decorations.ts) so the index can never disagree with what
 * the editor shows. This file only groups classified lines into elements/scenes.
 *
 * COORDINATE CONVENTIONS (the contract for any other consumer, incl. a future Python engine)
 *  - Lines are ONE-BASED and split on "\n" only. A trailing "\r" (CRLF) belongs to the
 *    line terminator, never to line content. A final "\n" yields a final empty line.
 *  - Offsets (`from`, `to`, `lineStarts`) are UTF-16 code-unit offsets into the exact
 *    source string (JS string indices; astral characters count as 2).
 *  - `from` is the first code unit of the element's first line (leading indentation included);
 *    `to` is the exclusive end of its last line, excluding the line terminator.
 *    Hence `element.text === source.slice(element.from, element.to)` always (multi-line
 *    elements keep their original "\n" / "\r\n" separators).
 *  - Scene `lineStart` is the heading line; `lineEnd` is the last line before the next heading
 *    (or the last line of the document), inclusive.
 *
 * IDENTITY: `sceneHash` is a content hash (heading through last content line; trailing blank
 * lines and trailing section/synopsis/page-break/episode lines are excluded so they do not
 * perturb it). It does not encode position, so unchanged scenes can be carried forward by a
 * later incremental cache. It is NOT a durable scene identity (duplicate scenes hash equal).
 */
import { classifyDocument } from '../editor/fountain-decorations'

export const SCRIPT_INDEX_SCHEMA_VERSION = 1
export const SCRIPT_INDEX_PARSER_VERSION = 1

export type ElementKind = 'cue' | 'dialogue' | 'parenthetical' | 'action' | 'transition' | 'note' | 'other'
export type IntExt = 'INT' | 'EXT' | 'INT/EXT' | 'UNKNOWN'
export type TimeOfDay =
  | 'DAY'
  | 'NIGHT'
  | 'DAWN'
  | 'DUSK'
  | 'MORNING'
  | 'EVENING'
  | 'AFTERNOON'
  | 'CONTINUOUS'
  | 'LATER'
  | 'SAME'
  | 'UNKNOWN'

export interface IndexElement {
  kind: ElementKind
  lineStart: number
  lineEnd: number
  from: number
  to: number
  text: string
  /** dialogue / parenthetical / cue: normalised speaker name */
  speaker?: string
  /** cue: all trailing parentheticals, e.g. "V.O." or "O.S., CONT'D" */
  extension?: string
  /** cue/dialogue/parenthetical of the second (^) side of a dual-dialogue pair */
  dual?: boolean
  /** kind 'other' only: what it is */
  tag?: 'section' | 'synopsis' | 'boneyard' | 'page-break' | 'episode-boundary' | 'killbox-section' | 'lyric'
}

export interface IndexScene {
  /** zero-based position in `scenes` (not a durable identity) */
  index: number
  headingLine: number
  rawHeading: string
  sceneNumber?: string
  intExt: IntExt
  location: string
  timeOfDay: TimeOfDay
  /** the recognised trailing time token as written, else null */
  timeRaw: string | null
  lineStart: number
  lineEnd: number
  sceneHash: string
  elements: IndexElement[]
}

export interface IndexCharacter {
  name: string
  /** other raw spellings merged into `name` (e.g. "McCLANE" under "MCCLANE") */
  aliases: string[]
  /** -1 when first cue precedes any scene heading */
  firstSceneIndex: number
  firstLine: number
  /** source lines of dialogue spoken (parentheticals excluded) */
  lineCount: number
  cueCount: number
  scenes: number[]
}

export interface TitlePageField {
  key: string
  value: string
  line: number
}

export interface ScriptIndex {
  schemaVersion: number
  parserVersion: number
  revisionHash: string
  titlePage: TitlePageField[]
  /** elements before the first scene heading (excluding the title page) */
  preamble: IndexElement[]
  scenes: IndexScene[]
  characters: IndexCharacter[]
  /** UTF-16 offset of the start of each line; lineStarts[line - 1] */
  lineStarts: number[]
}

/** Stable, fast, non-cryptographic 64-bit hash (hex) of text.slice(from, to). */
export function hashRange(text: string, from = 0, to = text.length): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = from; i < to; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

const TIME_WORDS: Record<string, TimeOfDay> = {
  DAY: 'DAY',
  DAYTIME: 'DAY',
  NIGHT: 'NIGHT',
  DAWN: 'DAWN',
  SUNRISE: 'DAWN',
  DUSK: 'DUSK',
  SUNSET: 'DUSK',
  TWILIGHT: 'DUSK',
  MORNING: 'MORNING',
  EVENING: 'EVENING',
  AFTERNOON: 'AFTERNOON',
  CONTINUOUS: 'CONTINUOUS',
  "CONT'D": 'CONTINUOUS',
  LATER: 'LATER',
  SAME: 'SAME',
}

const TIME_MODIFIERS = new Set([
  'LATE',
  'EARLY',
  'MID',
  'NEXT',
  'THE',
  'OF',
  'THAT',
  'SAME',
  'MOMENTS',
  'A',
  'FEW',
  'DAYS',
  'YEARS',
])

/** True only when the whole segment is a time phrase ("LATE AFTERNOON"), not a place that contains a time word ("DAY ROOM"). */
function isTimeExpression(token: string): boolean {
  const words = token
    .toUpperCase()
    .split(/[\s/,()]+/)
    .filter(Boolean)
  return words.some((w) => TIME_WORDS[w]) && words.every((w) => TIME_WORDS[w] || TIME_MODIFIERS.has(w))
}

function parseTime(token: string): TimeOfDay {
  for (const w of token.toUpperCase().split(/[\s/,()]+/)) {
    const t = TIME_WORDS[w]
    if (t) return t
  }
  return 'UNKNOWN'
}

const INT_EXT_RE = /^(INT\.?\s*\/\s*EXT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?)(?=[\s.]|$)/i
const TIME_SEP_RE = /\s[-–—]\s/g

function parseHeading(raw: string) {
  let s = raw.trim()
  if (s.startsWith('.') && s[1] !== '.') s = s.slice(1).trim()
  let sceneNumber: string | undefined
  const num = /\s#([^#]+)#\s*$/.exec(s)
  if (num) {
    sceneNumber = num[1].trim()
    s = s.slice(0, num.index).trim()
  }
  let intExt: IntExt = 'UNKNOWN'
  const m = INT_EXT_RE.exec(s)
  if (m) {
    const p = m[1].toUpperCase().replace(/[\s.]/g, '')
    intExt = p === 'EXT' ? 'EXT' : p === 'INT' ? 'INT' : 'INT/EXT'
    s = s.slice(m[0].length).replace(/^[.\s]+/, '')
  }
  let location = s
  let timeRaw: string | null = null
  let timeOfDay: TimeOfDay = 'UNKNOWN'
  // The time can sit before a qualifier ("NIGHT - HALLUCINATION", "DUSK - TRANSITION"): take the right-most
  // segment that reads as a time; everything before it is the location.
  const seps: RegExpExecArray[] = []
  TIME_SEP_RE.lastIndex = 0
  for (let r = TIME_SEP_RE.exec(s); r; r = TIME_SEP_RE.exec(s)) seps.push(r)
  for (let i = seps.length - 1; i >= 0; i--) {
    const start = seps[i].index + seps[i][0].length
    const end = i + 1 < seps.length ? seps[i + 1].index : s.length
    const token = s.slice(start, end).trim()
    // The last segment keeps the old lenient read; an interior segment must be a time phrase on its own.
    const t = i === seps.length - 1 || isTimeExpression(token) ? parseTime(token) : 'UNKNOWN'
    if (t !== 'UNKNOWN') {
      location = s.slice(0, seps[i].index).trim()
      timeRaw = token
      timeOfDay = t
      break
    }
  }
  return { sceneNumber, intExt, location, timeOfDay, timeRaw }
}

const EXT_RE = /\s*\(([^()]*)\)\s*$/

function parseCue(line: string) {
  let s = line.trim()
  if (s.startsWith('@')) s = s.slice(1)
  let dual = false
  if (s.endsWith('^')) {
    dual = true
    s = s.slice(0, -1).trim()
  }
  const exts: string[] = []
  for (let m = EXT_RE.exec(s); m; m = EXT_RE.exec(s)) {
    exts.unshift(m[1].trim())
    s = s.slice(0, m.index)
  }
  const display = s.trim().replace(/\s+/g, ' ')
  return { display, name: display.toUpperCase(), extension: exts.length ? exts.join(', ') : undefined, dual }
}

const STRUCTURAL_TAGS = new Set(['section', 'synopsis', 'page-break', 'episode-boundary', 'killbox-section'])
const TITLE_KEY_RE = /^[A-Za-z][\w ]*:/

export function buildScriptIndex(text: string): ScriptIndex {
  // classifyDocument starts in "title page" mode, so a script whose first line is not a
  // title key (e.g. "INT. ROOM") would be swallowed as title page. A leading blank line
  // switches that mode off; we drop the synthetic line again below.
  const firstLine = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n')).trim()
  const hasTitle = TITLE_KEY_RE.test(firstLine) && !/^(FADE|CUT|DISSOLVE|SMASH)\b|TO:$/i.test(firstLine)
  const classified = classifyDocument(hasTitle ? text : `\n${text}`)
  const lines = hasTitle ? classified : classified.slice(1)

  const n = lines.length
  const lineStarts: number[] = new Array(n)
  const lineEnds: number[] = new Array(n) // exclusive, terminator excluded
  let off = 0
  for (let i = 0; i < n; i++) {
    lineStarts[i] = off
    const raw = lines[i].text
    const len = raw.endsWith('\r') ? raw.length - 1 : raw.length
    lineEnds[i] = off + len
    off += raw.length + 1
  }

  const titlePage: TitlePageField[] = []
  const preamble: IndexElement[] = []
  const scenes: IndexScene[] = []
  const lastContent: number[] = []
  const chars = new Map<string, IndexCharacter & { sceneSet: Set<number>; spellings: Set<string> }>()

  let cur: IndexElement[] = preamble
  let block: { speaker: string; dual: boolean } | null = null
  let mergeKey: string | null = null
  let noteOpen = false

  const emit = (e: IndexElement, key: string | null, line: number) => {
    const prev = cur[cur.length - 1]
    if (key && key === mergeKey && prev && prev.lineEnd === line - 1) {
      prev.lineEnd = line
      prev.to = e.to
      prev.text = text.slice(prev.from, prev.to)
    } else {
      cur.push(e)
    }
    mergeKey = key
    if (scenes.length && !(e.kind === 'other' && e.tag && STRUCTURAL_TAGS.has(e.tag))) {
      lastContent[scenes.length - 1] = line
    }
  }
  const mk = (kind: ElementKind, line: number, extra: Partial<IndexElement> = {}): IndexElement => {
    const from = lineStarts[line - 1]
    const to = lineEnds[line - 1]
    return { kind, lineStart: line, lineEnd: line, from, to, text: text.slice(from, to), ...extra }
  }

  for (let i = 0; i < n; i++) {
    const line = i + 1
    const type = lines[i].type
    const trimmed = lines[i].text.trim()

    if (type === 'blank') {
      block = null
      mergeKey = null
      noteOpen = false
      continue
    }
    if (type === 'title-page-key' || type === 'title-page-value') {
      if (type === 'title-page-key') {
        const c = trimmed.indexOf(':')
        titlePage.push({ key: trimmed.slice(0, c).trim(), value: trimmed.slice(c + 1).trim(), line })
      } else if (titlePage.length) {
        const f = titlePage[titlePage.length - 1]
        f.value = f.value ? `${f.value}\n${trimmed}` : trimmed
      }
      continue
    }
    if (type === 'scene-heading') {
      block = null
      mergeKey = null
      noteOpen = false
      const h = parseHeading(lines[i].text)
      const idx = scenes.length
      const el: IndexElement[] = []
      scenes.push({
        index: idx,
        headingLine: line,
        rawHeading: lines[i].text.replace(/\r$/, ''),
        ...(h.sceneNumber !== undefined ? { sceneNumber: h.sceneNumber } : {}),
        intExt: h.intExt,
        location: h.location,
        timeOfDay: h.timeOfDay,
        timeRaw: h.timeRaw,
        lineStart: line,
        lineEnd: n,
        sceneHash: '',
        elements: el,
      })
      lastContent[idx] = line
      cur = el
      continue
    }

    // Notes (the classifier has no note-line type except [[EPISODE]]).
    if (type !== 'boneyard' && type !== 'episode-boundary') {
      const standalone = trimmed.startsWith('[[') && trimmed.indexOf(']]') === trimmed.length - 2
      const opens = trimmed.startsWith('[[') && !trimmed.includes(']]')
      if (noteOpen || standalone || opens) {
        const key = noteOpen || opens ? 'note-open' : null
        emit(mk('note', line), key, line)
        noteOpen = opens || (noteOpen && !trimmed.includes(']]'))
        if (!noteOpen) mergeKey = null
        continue
      }
    }

    const sceneIdx = scenes.length - 1
    switch (type) {
      case 'character':
      case 'dual-character': {
        const c = parseCue(lines[i].text)
        const dual = type === 'dual-character' || c.dual
        block = { speaker: c.name, dual }
        const e = mk('cue', line, { speaker: c.name })
        if (c.extension) e.extension = c.extension
        if (dual) e.dual = true
        emit(e, null, line)
        let ch = chars.get(c.name)
        if (!ch) {
          ch = {
            name: c.name,
            aliases: [],
            firstSceneIndex: sceneIdx,
            firstLine: line,
            lineCount: 0,
            cueCount: 0,
            scenes: [],
            sceneSet: new Set(),
            spellings: new Set(),
          }
          chars.set(c.name, ch)
        }
        ch.cueCount++
        ch.spellings.add(c.display)
        if (sceneIdx >= 0 && !ch.sceneSet.has(sceneIdx)) {
          ch.sceneSet.add(sceneIdx)
          ch.scenes.push(sceneIdx)
        }
        break
      }
      case 'parenthetical':
        if (block) {
          const e = mk('parenthetical', line, { speaker: block.speaker })
          if (block.dual) e.dual = true
          emit(e, null, line)
        } else emit(mk('action', line), 'action', line)
        break
      case 'dialogue':
      case 'dual-dialogue':
      case 'lyric':
        if (block) {
          const e = mk('dialogue', line, { speaker: block.speaker })
          if (block.dual) e.dual = true
          emit(e, `dialogue:${block.speaker}`, line)
          const ch = chars.get(block.speaker)
          if (ch) ch.lineCount++
        } else emit(mk('other', line, { tag: 'lyric' }), null, line)
        break
      case 'transition':
        block = null
        emit(mk('transition', line), null, line)
        break
      case 'boneyard':
        block = null
        emit(mk('other', line, { tag: 'boneyard' }), 'boneyard', line)
        break
      case 'page-break':
      case 'episode-boundary':
      case 'killbox-section':
        block = null
        emit(mk('other', line, { tag: type }), null, line)
        break
      case 'centered-text':
        block = null
        emit(mk('action', line, {}), null, line)
        break
      default: {
        // 'action' (and anything unknown). Sections/synopses are an overlay: the classifier
        // has no type for them.
        block = null
        if (trimmed.startsWith('#')) emit(mk('other', line, { tag: 'section' }), null, line)
        else if (trimmed.startsWith('=')) emit(mk('other', line, { tag: 'synopsis' }), null, line)
        else emit(mk('action', line), 'action', line)
      }
    }
  }

  for (let s = 0; s < scenes.length; s++) {
    const sc = scenes[s]
    if (s + 1 < scenes.length) sc.lineEnd = scenes[s + 1].headingLine - 1
    sc.sceneHash = hashRange(text, lineStarts[sc.lineStart - 1], lineEnds[lastContent[s] - 1])
  }

  const characters: IndexCharacter[] = []
  for (const c of chars.values()) {
    const { sceneSet: _s, spellings, ...rest } = c
    rest.aliases = [...spellings].filter((sp) => sp !== c.name)
    characters.push(rest)
  }

  return {
    schemaVersion: SCRIPT_INDEX_SCHEMA_VERSION,
    parserVersion: SCRIPT_INDEX_PARSER_VERSION,
    revisionHash: hashRange(text),
    titlePage,
    preamble,
    scenes,
    characters,
    lineStarts,
  }
}

/** Scene containing a one-based line, or null before the first heading / out of range. */
export function sceneAtLine(index: ScriptIndex, line: number): IndexScene | null {
  const sc = index.scenes
  let lo = 0
  let hi = sc.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sc[mid].lineStart <= line) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found >= 0 && line <= sc[found].lineEnd ? sc[found] : null
}

/** Element covering a one-based line (null for blank lines, headings and out-of-range). */
export function elementAtLine(
  index: ScriptIndex,
  line: number,
): { scene: IndexScene | null; element: IndexElement } | null {
  const scene = sceneAtLine(index, line)
  const list = scene ? scene.elements : index.preamble
  const element = list.find((e) => e.lineStart <= line && line <= e.lineEnd)
  return element ? { scene, element } : null
}

/**
 * Source slice for one-based inclusive lines [fromLine, toLine], terminator of the last
 * line excluded. `source` must be the exact text the index was built from.
 */
export function textAtLines(index: ScriptIndex, source: string, fromLine: number, toLine: number): string {
  const n = index.lineStarts.length
  const a = Math.max(1, fromLine)
  const b = Math.min(n, toLine)
  if (a > b) return ''
  let end = b < n ? index.lineStarts[b] - 1 : source.length
  if (source.charCodeAt(end - 1) === 13) end--
  return source.slice(index.lineStarts[a - 1], end)
}
