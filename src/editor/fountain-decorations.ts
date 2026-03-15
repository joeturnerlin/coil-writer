import { type EditorState, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

/**
 * Maps Fountain element type names to CSS classes.
 * Line decorations are applied per-line based on classification.
 *
 * FALLBACK APPROACH: StreamLanguage does not expose custom token names
 * in the syntax tree (only built-in lezer tags like "character" survive).
 * So we re-parse the document line-by-line using the same classification
 * logic as the StreamParser in fountain-language.ts.
 */

// ── CSS class for each Fountain element ──
const ELEMENT_CLASS: Record<string, string> = {
  'scene-heading': 'fountain-scene-heading',
  character: 'fountain-character',
  dialogue: 'fountain-dialogue',
  parenthetical: 'fountain-parenthetical',
  transition: 'fountain-transition',
  action: 'fountain-action',
  'episode-boundary': 'fountain-episode-boundary',
  'killbox-section': 'fountain-killbox-section',
  'page-break': 'fountain-page-break',
  boneyard: 'fountain-boneyard',
  note: 'fountain-note',
  'centered-text': 'fountain-centered-text',
  lyric: 'fountain-lyric',
  'dual-character': 'fountain-dual-character',
  'dual-dialogue': 'fountain-dual-dialogue',
  'title-page-key': 'fountain-title-page-key',
  'title-page-value': 'fountain-title-page-value',
  blank: 'fountain-blank',
}

// Pre-build Decoration.line objects for each type (they are reusable)
const LINE_DECOS: Record<string, Decoration> = {}
for (const [tokenType, className] of Object.entries(ELEMENT_CLASS)) {
  LINE_DECOS[tokenType] = Decoration.line({ class: className })
}

// Block-start variants: first element after a blank line gets extra class for top spacing
const LINE_DECOS_START: Record<string, Decoration> = {}
for (const [tokenType, className] of Object.entries(ELEMENT_CLASS)) {
  if (tokenType !== 'blank') {
    LINE_DECOS_START[tokenType] = Decoration.line({ class: `${className} fountain-block-start` })
  }
}

/**
 * Classify a single line of Fountain text.
 * Mirrors the logic in fountain-language.ts token() function.
 */
function classifyLine(
  line: string,
  prevType: string | null,
  prevBlank: boolean,
  inTitlePage: boolean,
  inBoneyard: boolean,
): { type: string; inTitlePage: boolean; inBoneyard: boolean } {
  const trimmed = line.trim()
  if (trimmed === '') return { type: 'blank', inTitlePage: false, inBoneyard }

  // 1. Boneyard continuation
  if (inBoneyard) {
    const stillInBoneyard = !trimmed.includes('*/')
    return { type: 'boneyard', inTitlePage, inBoneyard: stillInBoneyard }
  }

  // 2. Title page mode
  if (inTitlePage) {
    if (trimmed === '===') return { type: 'page-break', inTitlePage: false, inBoneyard }
    if (/^\w[\w\s]*:/.test(trimmed)) return { type: 'title-page-key', inTitlePage, inBoneyard }
    return { type: 'title-page-value', inTitlePage, inBoneyard }
  }

  // 3. Boneyard opening
  if (trimmed.startsWith('/*')) {
    const staysOpen = !trimmed.includes('*/')
    return { type: 'boneyard', inTitlePage, inBoneyard: staysOpen }
  }

  // 4. Forced elements
  if (trimmed.startsWith('@') && trimmed.endsWith('^')) return { type: 'dual-character', inTitlePage, inBoneyard }
  if (trimmed.startsWith('@')) return { type: 'character', inTitlePage, inBoneyard }
  if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.')
    return { type: 'scene-heading', inTitlePage, inBoneyard }
  if (trimmed.startsWith('!')) return { type: 'action', inTitlePage, inBoneyard }
  if (trimmed.startsWith('>') && trimmed.endsWith('<')) return { type: 'centered-text', inTitlePage, inBoneyard }
  if (trimmed.startsWith('>')) return { type: 'transition', inTitlePage, inBoneyard }

  // 4f. Lyrics
  if (trimmed.startsWith('~')) return { type: 'lyric', inTitlePage, inBoneyard }

  // 5. Page break
  if (trimmed === '===') return { type: 'page-break', inTitlePage, inBoneyard }

  // 6. Episode boundary
  if (/^\[\[EPISODE\s+\d+/i.test(trimmed)) return { type: 'episode-boundary', inTitlePage, inBoneyard }

  // 7. Killbox section
  if (/^#\s*\[\d+:\d+\s*-\s*\d+:\d+\]/.test(trimmed)) return { type: 'killbox-section', inTitlePage, inBoneyard }

  // 8. Scene heading
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) return { type: 'scene-heading', inTitlePage, inBoneyard }

  // 9. Transition
  if (/^(FADE|CUT|DISSOLVE|SMASH)/i.test(trimmed) || /TO:$/i.test(trimmed))
    return { type: 'transition', inTitlePage, inBoneyard }

  // 10. Parenthetical
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return { type: 'parenthetical', inTitlePage, inBoneyard }

  // 11. Character name (excludes ALL CAPS sentences ending with .!?)
  const afterBreak =
    prevType === null ||
    prevType === 'blank' ||
    prevType === 'scene-heading' ||
    prevType === 'killbox-section' ||
    prevType === 'episode-boundary' ||
    prevType === 'page-break' ||
    prevBlank
  const isDualCaret = trimmed.endsWith('^')
  const nameToCheck = isDualCaret ? trimmed.slice(0, -1).trim() : trimmed
  const coreName = nameToCheck.replace(/\s*\(.*\)$/, '')
  if (
    afterBreak &&
    /^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(nameToCheck) &&
    nameToCheck.length < 50 &&
    !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(nameToCheck) &&
    !/[.!?]$/.test(coreName)
  ) {
    return { type: isDualCaret ? 'dual-character' : 'character', inTitlePage, inBoneyard }
  }

  // 12. Dialogue (also follows dual-character for dual dialogue blocks)
  if (
    prevType === 'character' ||
    prevType === 'dual-character' ||
    prevType === 'parenthetical' ||
    prevType === 'dialogue' ||
    prevType === 'dual-dialogue'
  ) {
    const isDual = prevType === 'dual-character' || prevType === 'dual-dialogue'
    return { type: isDual ? 'dual-dialogue' : 'dialogue', inTitlePage, inBoneyard }
  }

  // 13. Default: action
  return { type: 'action', inTitlePage, inBoneyard }
}

/**
 * Classify every line in a document string.
 * Exported for use in tests and stats computation.
 */
export function classifyDocument(text: string): { lineNumber: number; text: string; type: string }[] {
  const lines = text.split('\n')
  const result: { lineNumber: number; text: string; type: string }[] = []
  let prevType: string | null = null
  let prevBlank = false
  let inTitlePage = true
  let inBoneyard = false

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]
    const classified = classifyLine(lineText, prevType, prevBlank, inTitlePage, inBoneyard)

    inTitlePage = classified.inTitlePage
    inBoneyard = classified.inBoneyard

    result.push({
      lineNumber: i + 1,
      text: lineText,
      type: classified.type,
    })

    prevBlank = classified.type === 'blank'
    prevType = classified.type
  }

  return result
}

/**
 * Build line decorations by re-parsing the document line-by-line.
 * Uses the same classification logic as the StreamParser.
 */
function buildLineDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const doc = state.doc
  let prevType: string | null = null
  let prevBlank = false
  let inTitlePage = true
  let inBoneyard = false

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const result = classifyLine(line.text, prevType, prevBlank, inTitlePage, inBoneyard)

    inTitlePage = result.inTitlePage
    inBoneyard = result.inBoneyard

    if (LINE_DECOS[result.type]) {
      const isBlockStart = result.type !== 'blank' && (prevBlank || prevType === 'page-break')
      const deco =
        isBlockStart && LINE_DECOS_START[result.type] ? LINE_DECOS_START[result.type] : LINE_DECOS[result.type]
      decorations.push(deco.range(line.from))
    }

    prevBlank = result.type === 'blank'
    prevType = result.type
  }

  return Decoration.set(decorations)
}

/**
 * PROVIDER 1: Line decorations via StateField.
 *
 * Uses StateField (NOT ViewPlugin) because line padding affects vertical layout.
 * CM6 docs: "Decorations that significantly affect the height of content
 * should be provided through state fields."
 */
export const fountainLineDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildLineDecorations(state)
  },
  update(decorations, tr) {
    if (!tr.docChanged) {
      return decorations
    }
    // Rebuild on any document change.
    // This is acceptable because buildLineDecorations is fast
    // (linear scan, no allocations beyond the decoration array).
    return buildLineDecorations(tr.state)
  },
  provide(field) {
    return EditorView.decorations.from(field)
  },
})

/**
 * PROVIDER 2: Mark decorations via ViewPlugin.
 *
 * For inline styling: bold (**text**), italic (*text*), underline (_text_).
 * SEPARATE from line decorations — mixing line and mark in same RangeSetBuilder crashes.
 *
 * For the overnight build, this handles:
 * - Bold: **text** → <strong>
 * - Italic: *text* → <em>
 * - Underline: _text_ → <u>
 * - Notes: [[text]] → dimmed (NOT episode boundaries)
 */
const boldDeco = Decoration.mark({ class: 'fountain-bold' })
const italicDeco = Decoration.mark({ class: 'fountain-italic' })
const underlineDeco = Decoration.mark({ class: 'fountain-underline' })
const noteDeco = Decoration.mark({ class: 'fountain-inline-note' })

const prefixHiddenDeco = Decoration.mark({ class: 'fountain-prefix-hidden' })

function buildMarkDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const doc = view.state.doc

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to)
    const offset = from

    // Bold: **text**
    const boldRegex = /\*\*(.+?)\*\*/g
    let match: RegExpExecArray | null
    while ((match = boldRegex.exec(text)) !== null) {
      decorations.push(boldDeco.range(offset + match.index, offset + match.index + match[0].length))
    }

    // Italic: *text* (but not **)
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g
    while ((match = italicRegex.exec(text)) !== null) {
      decorations.push(italicDeco.range(offset + match.index, offset + match.index + match[0].length))
    }

    // Underline: _text_
    const underlineRegex = /_(.+?)_/g
    while ((match = underlineRegex.exec(text)) !== null) {
      decorations.push(underlineDeco.range(offset + match.index, offset + match.index + match[0].length))
    }

    // Inline notes: [[text]] but NOT [[EPISODE ...]]
    const noteRegex = /\[\[(?!EPISODE)(.+?)\]\]/g
    while ((match = noteRegex.exec(text)) !== null) {
      decorations.push(noteDeco.range(offset + match.index, offset + match.index + match[0].length))
    }
  }

  // Hide forced prefixes (@, ., !, >) at the start of lines
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const trimmed = line.text.trimStart()
    const leadingSpaces = line.text.length - trimmed.length

    if (trimmed.length < 2) continue

    // @ = forced character, . = forced scene heading (but not ..), ! = forced action, > = forced transition (but not >...<)
    if (
      trimmed.startsWith('@') ||
      (trimmed.startsWith('.') && trimmed[1] !== '.') ||
      trimmed.startsWith('!') ||
      (trimmed.startsWith('>') && !trimmed.endsWith('<'))
    ) {
      const prefixStart = line.from + leadingSpaces
      decorations.push(prefixHiddenDeco.range(prefixStart, prefixStart + 1))
    }
  }

  // Sort by position
  decorations.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(decorations)
}

export const fountainMarkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
