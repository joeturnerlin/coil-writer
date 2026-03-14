import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

/** Scene heading prefixes (SmartType field 1) */
const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E. ']

/** Standard times of day (SmartType field 3) */
const TIMES_OF_DAY = [
  'DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER',
  'SAME', 'DAWN', 'DUSK', 'MORNING', 'EVENING', 'AFTERNOON',
]

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

/** Extract unique locations from existing scene headings in the document. */
function extractLocations(doc: string): string[] {
  const locations = new Set<string>()
  const lines = doc.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    let heading = ''
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i.test(trimmed)) {
      heading = trimmed.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, '')
    } else if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.') {
      heading = trimmed.slice(1).replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, '')
    }
    if (!heading) continue
    const dashIdx = heading.indexOf(' - ')
    const location = dashIdx >= 0 ? heading.slice(0, dashIdx).trim() : heading.trim()
    if (location) locations.add(location.toUpperCase())
  }
  return Array.from(locations).sort()
}

/** Scene heading completion source — three-field SmartType. */
function sceneHeadingCompletionSource(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const textBefore = line.text.slice(0, pos - line.from)
  const trimmed = textBefore.trim()

  // Only activate after blank line or at document start
  if (line.number > 1) {
    const prevLine = state.doc.line(line.number - 1)
    if (prevLine.text.trim() !== '') return null
  }

  // Field 1: Prefix completion (INT./EXT./etc.)
  if (trimmed === '' || trimmed === '.') return null

  const upper = trimmed.toUpperCase()
  const isForced = trimmed.startsWith('.')
  const matchText = isForced ? upper.slice(1) : upper

  const hasFullPrefix = /^\.?(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s/i.test(trimmed)

  if (!hasFullPrefix) {
    if (!/^\.?[IE]/i.test(trimmed)) return null
    const prefixMatches = SCENE_PREFIXES.filter(p => p.startsWith(matchText))
    if (prefixMatches.length === 0) return null
    return {
      from: line.from + (isForced ? 1 : 0),
      options: prefixMatches.map(p => ({
        label: p.trimEnd(),
        apply: (isForced ? '' : '.') + p,
        type: 'keyword',
        boost: 2,
      })),
      filter: false,
    }
  }

  // Field 2: Location completion (after prefix)
  const afterPrefix = trimmed.replace(/^\.?(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*/i, '')
  const hasDash = afterPrefix.includes(' - ')

  if (!hasDash) {
    const doc = state.doc.toString()
    const allLocations = extractLocations(doc)
    const locUpper = afterPrefix.toUpperCase()
    const prefixEnd = textBefore.length - afterPrefix.length
    const from = line.from + prefixEnd

    if (afterPrefix.length < 1) {
      if (allLocations.length === 0) return null
      return {
        from,
        options: allLocations.map(loc => ({
          label: loc,
          apply: loc + ' - ',
          type: 'text',
          boost: 1,
        })),
        filter: false,
      }
    }

    const matches = allLocations.filter(loc => loc.startsWith(locUpper) && loc !== locUpper)
    if (matches.length === 0) return null
    return {
      from,
      options: matches.map(loc => ({
        label: loc,
        apply: loc + ' - ',
        type: 'text',
        boost: 1,
      })),
      filter: false,
    }
  }

  // Field 3: Time of day completion (after " - ")
  const afterDash = afterPrefix.slice(afterPrefix.indexOf(' - ') + 3)
  const timeUpper = afterDash.toUpperCase()
  const dashPos = textBefore.lastIndexOf(' - ') + 3
  const from = line.from + dashPos

  const timeMatches = afterDash.length === 0
    ? TIMES_OF_DAY
    : TIMES_OF_DAY.filter(t => t.startsWith(timeUpper) && t !== timeUpper)

  if (timeMatches.length === 0) return null
  return {
    from,
    options: timeMatches.map(t => ({
      label: t,
      type: 'text',
      boost: 1,
    })),
    filter: false,
  }
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
 * CM6 extension that provides screenplay autocomplete:
 * - Character names (after blank line, typing uppercase)
 * - Scene heading SmartType (prefix → location → time of day)
 */
export function characterAutocomplete(): Extension {
  return autocompletion({
    override: [sceneHeadingCompletionSource, characterCompletionSource],
    defaultKeymap: true,
    icons: false,
    optionClass: () => 'cm-character-completion',
  })
}
