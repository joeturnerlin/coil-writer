import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

/**
 * Character name autocomplete — Final Draft style.
 *
 * Scans the document for character names (lines classified as character cues),
 * then offers completions when the user starts typing uppercase letters after
 * a blank line. Arrow keys cycle through suggestions, Enter/Tab accepts.
 */

/** Extract all unique character names from the document text. */
function extractCharacterNames(doc: string): string[] {
  const names = new Set<string>()
  const lines = doc.split('\n')
  let prevBlank = false
  let prevType: string | null = null
  let inTitlePage = true

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      if (inTitlePage) inTitlePage = false
      prevBlank = true
      prevType = 'blank'
      continue
    }

    // Title page mode
    if (inTitlePage) {
      if (trimmed === '===') inTitlePage = false
      prevBlank = false
      prevType = 'title'
      continue
    }

    // Skip structural elements
    if (trimmed.startsWith('/*') || trimmed.startsWith('.') || trimmed.startsWith('!') ||
        trimmed.startsWith('>') || trimmed.startsWith('~') || trimmed === '===' ||
        /^\[\[EPISODE/i.test(trimmed) || /^#\s*\[/.test(trimmed) ||
        /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed) ||
        /^(FADE|CUT|DISSOLVE|SMASH)/i.test(trimmed) || /TO:$/i.test(trimmed)) {
      prevBlank = false
      prevType = 'other'
      continue
    }

    // Forced character
    if (trimmed.startsWith('@')) {
      const name = trimmed.slice(1).replace(/\s*\^$/, '').trim().toUpperCase()
      if (name) names.add(name)
      prevBlank = false
      prevType = 'character'
      continue
    }

    // Natural character: ALL CAPS after blank, < 50 chars, no sentence-ending punctuation
    const afterBreak = prevBlank || prevType === 'blank' || prevType === null ||
                       prevType === 'scene-heading' || prevType === 'page-break'
    const coreName = trimmed.replace(/\s*\(.*\)$/, '').replace(/\s*\^$/, '')
    if (
      afterBreak &&
      /^[A-Z][A-Z0-9 .']+$/.test(coreName) &&
      trimmed.length < 50 &&
      !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(trimmed) &&
      !/[.!?]$/.test(coreName)
    ) {
      names.add(coreName)
      prevBlank = false
      prevType = 'character'
      continue
    }

    // Dialogue/parenthetical/action
    if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
      prevType = trimmed.startsWith('(') && trimmed.endsWith(')') ? 'parenthetical' : 'dialogue'
    } else {
      prevType = 'action'
    }
    prevBlank = false
  }

  return Array.from(names).sort()
}

/** Check if the cursor is in a position where a character name is expected. */
function isCharacterPosition(context: CompletionContext): boolean {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const textBefore = line.text.slice(0, pos - line.from)

  // Must be typing uppercase or @ prefix
  if (textBefore.length === 0) return false
  if (textBefore.startsWith('@')) return true

  // Check if all typed chars are uppercase/spaces/digits (natural character pattern)
  if (!/^[A-Z][A-Z0-9 .']*$/.test(textBefore.trim())) return false

  // Must follow a blank line (or be at start)
  if (line.number <= 1) return false
  const prevLine = state.doc.line(line.number - 1)
  return prevLine.text.trim() === ''
}

function characterCompletionSource(context: CompletionContext): CompletionResult | null {
  // Only activate when typing uppercase after blank line
  if (!isCharacterPosition(context)) return null

  const line = context.state.doc.lineAt(context.pos)
  let prefix = line.text.slice(0, context.pos - line.from).trim()

  // Strip @ prefix for matching
  const hasAt = prefix.startsWith('@')
  if (hasAt) prefix = prefix.slice(1)

  // Need at least 1 character to trigger
  if (prefix.length < 1) return null

  const doc = context.state.doc.toString()
  const allNames = extractCharacterNames(doc)

  // Filter to names matching the prefix
  const upper = prefix.toUpperCase()
  const matches = allNames.filter(name => name.startsWith(upper) && name !== upper)

  if (matches.length === 0) return null

  return {
    from: line.from + (hasAt ? 1 : 0),
    options: matches.map(name => ({
      label: name,
      type: 'text',
      boost: 1,
    })),
    filter: false,
  }
}

/**
 * CM6 extension that provides character name autocomplete.
 * Activates when typing uppercase letters after a blank line.
 */
export function characterAutocomplete(): Extension {
  return autocompletion({
    override: [characterCompletionSource],
    defaultKeymap: true,
    icons: false,
    optionClass: () => 'cm-character-completion',
  })
}
