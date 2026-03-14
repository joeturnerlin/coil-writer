import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

/**
 * Tab cycling order for line types (screenplay writing flow):
 * Action → Scene Heading → Character → Dialogue → Parenthetical → Transition → Action
 *
 * Shift-Tab reverses the cycle.
 *
 * Forced Fountain prefixes are used for unambiguous type marking:
 * - .TEXT = scene heading
 * - @TEXT = character (uppercase)
 * - (text) = parenthetical
 * - !text = forced action
 * - >text = transition
 * - plain text = dialogue (default in dialogue context)
 *
 * Case handling: cycling TO character uppercases; cycling AWAY from
 * character restores sentence case so you don't get stuck in ALL CAPS.
 */

const CYCLE_ORDER = ['action', 'scene-heading', 'character', 'dialogue', 'parenthetical', 'transition'] as const
type CycleType = (typeof CYCLE_ORDER)[number]

function detectLineType(text: string): CycleType {
  const trimmed = text.trim()

  // Forced scene heading
  if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.') return 'scene-heading'

  // Forced character
  if (trimmed.startsWith('@')) return 'character'

  // Forced action
  if (trimmed.startsWith('!')) return 'action'

  // Forced transition
  if (trimmed.startsWith('>') && !trimmed.endsWith('<')) return 'transition'

  // Centered text — treat as action for cycling purposes
  if (trimmed.startsWith('>') && trimmed.endsWith('<')) return 'action'

  // Parenthetical
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return 'parenthetical'

  // Natural scene heading
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) return 'scene-heading'

  // Natural transition
  if (/^(FADE|CUT|DISSOLVE|SMASH)/i.test(trimmed) || /TO:$/i.test(trimmed)) return 'transition'

  // Natural character (ALL CAPS, not a sentence)
  const coreName = trimmed.replace(/\s*\(.*\)$/, '')
  if (
    /^[A-Z][A-Z0-9 .']+$/.test(coreName) &&
    trimmed.length < 50 &&
    !/[.!?]$/.test(coreName) &&
    !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(trimmed)
  ) {
    return 'character'
  }

  // Default: dialogue
  return 'dialogue'
}

/** Strip all Fountain prefixes and wrapping to get raw text. */
function cleanText(text: string): string {
  let clean = text.trim()
  // Remove parenthetical wrapping
  if (clean.startsWith('(') && clean.endsWith(')')) clean = clean.slice(1, -1).trim()
  // Remove forced prefixes (order matters: check multi-char patterns first)
  if (clean.startsWith('@')) clean = clean.slice(1).trim()
  if (clean.startsWith('!')) clean = clean.slice(1).trim()
  if (clean.startsWith('.') && clean.length > 1 && clean[1] !== '.') clean = clean.slice(1).trim()
  if (clean.startsWith('>')) clean = clean.slice(1).trim()
  return clean
}

/**
 * Transform text to a target element type.
 *
 * Case is NEVER mutated — CSS text-transform handles display.
 * Character names display uppercase via .fountain-character { text-transform: uppercase }
 * Scene headings display uppercase via .fountain-scene-heading { text-transform: uppercase }
 * This preserves intentional caps (BOMB, SARAH) in action/dialogue.
 */
function transformToType(cleaned: string, targetType: CycleType): string {
  switch (targetType) {
    case 'scene-heading':
      return `.${cleaned}`
    case 'character':
      return `@${cleaned}`
    case 'parenthetical':
      return `(${cleaned})`
    case 'action':
      return `!${cleaned}`
    case 'transition':
      return `>${cleaned}`
    case 'dialogue':
    default:
      return cleaned
  }
}

function cycleLineType(state: EditorState, direction: 1 | -1): TransactionSpec | null {
  const line = state.doc.lineAt(state.selection.main.head)
  const text = line.text.trim()

  // Empty line: treat as action and cycle to next type
  const currentType = text === '' ? 'action' : detectLineType(text)

  const currentIndex = CYCLE_ORDER.indexOf(currentType)
  const nextIndex = (currentIndex + direction + CYCLE_ORDER.length) % CYCLE_ORDER.length
  const nextType = CYCLE_ORDER[nextIndex]

  const cleaned = text === '' ? '' : cleanText(text)
  const newText = transformToType(cleaned, nextType)

  return {
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: line.from + newText.length },
  }
}

/**
 * Smart Enter key for screenplay writing flow:
 *
 * - After character name → single newline (dialogue follows immediately)
 * - After parenthetical → single newline (dialogue follows immediately)
 * - After everything else → double newline (blank line separator)
 *
 * Only activates when cursor is at end of a non-empty line.
 */
function smartEnter(view: EditorView): boolean {
  const state = view.state
  const pos = state.selection.main.head
  const line = state.doc.lineAt(pos)
  const text = line.text.trim()

  // Don't apply on empty lines
  if (text === '') return false

  const isCharacter =
    text.startsWith('@') ||
    (/^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(text) &&
      text.length < 50 &&
      !/[.!?]$/.test(text.replace(/\s*\(.*\)$/, '')) &&
      !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(text))

  const isParenthetical = text.startsWith('(') && text.endsWith(')')

  // Character/parenthetical: single newline → dialogue follows
  // Everything else: double newline → blank line separator (standard Fountain)
  const insertText = isCharacter || isParenthetical ? '\n' : '\n\n'

  view.dispatch({
    changes: { from: pos, insert: insertText },
    selection: { anchor: pos + insertText.length },
  })

  return true
}

/**
 * Force-assign a line to a specific element type.
 * Used by Cmd+1-7 shortcuts (Final Draft convention).
 */
function forceElementType(view: EditorView, targetType: CycleType | 'shot'): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const text = line.text.trim()
  const cleaned = text === '' ? '' : cleanText(text)

  let newText: string
  if (targetType === 'shot') {
    newText = cleaned.toUpperCase()
  } else {
    newText = transformToType(cleaned, targetType)
  }

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: line.from + newText.length },
  })
  return true
}

export const fountainKeymap: KeyBinding[] = [
  {
    key: 'Tab',
    run(view) {
      const spec = cycleLineType(view.state, 1)
      if (spec) {
        view.dispatch(spec)
      }
      return true
    },
  },
  {
    key: 'Shift-Tab',
    run(view) {
      const spec = cycleLineType(view.state, -1)
      if (spec) {
        view.dispatch(spec)
      }
      return true
    },
  },
  {
    key: 'Enter',
    run: smartEnter,
  },
  // ── Cmd+1-7: Direct element assignment (Final Draft convention) ──
  {
    key: 'Mod-1',
    run(view) { return forceElementType(view, 'scene-heading') },
  },
  {
    key: 'Mod-2',
    run(view) { return forceElementType(view, 'action') },
  },
  {
    key: 'Mod-3',
    run(view) { return forceElementType(view, 'character') },
  },
  {
    key: 'Mod-4',
    run(view) { return forceElementType(view, 'parenthetical') },
  },
  {
    key: 'Mod-5',
    run(view) { return forceElementType(view, 'dialogue') },
  },
  {
    key: 'Mod-6',
    run(view) { return forceElementType(view, 'transition') },
  },
  {
    key: 'Mod-7',
    run(view) { return forceElementType(view, 'shot') },
  },
]
