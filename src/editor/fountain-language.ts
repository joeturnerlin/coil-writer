import { StreamLanguage, type StringStream } from '@codemirror/language'
import { FountainElement, type FountainParserState } from './types'

/**
 * Classification rules (applied in order):
 *
 * 1. If inBoneyard, check for closing * / → return 'boneyard'
 * 2. If inTitlePage:
 *    a. Line is '===' → switch to screenplay mode, return 'page-break'
 *    b. Line matches /^\w[\w\s]*:/ → return 'title-page-key'
 *    c. Anything else (continuation value) → return 'title-page-value'
 * 3. Check for boneyard opening / * → set inBoneyard, return 'boneyard'
 * 4. Forced elements (check FIRST before any other screenplay rule):
 *    a. Starts with '@' → 'character' (forced character)
 *    b. Starts with '.' followed by non-dot → 'scene-heading' (forced scene heading)
 *    c. Starts with '!' → 'action' (forced action)
 *    d. Starts with '>' and ends with '<' → 'centered-text'
 *    e. Starts with '>' (not ending '<') → 'transition' (forced transition)
 * 5. Line is '===' → 'page-break'
 * 6. Line matches /^\[\[EPISODE\s+\d+/ → 'episode-boundary'
 * 7. Line matches /^#\s*\[\d+:\d+\s*-\s*\d+:\d+\]/ → 'killbox-section'
 * 8. Line matches /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i → 'scene-heading'
 * 9. Line matches /^(FADE|CUT|DISSOLVE|SMASH)/i or ends with 'TO:' → 'transition'
 * 10. Starts with '(' and ends with ')' → 'parenthetical'
 * 11. Previous line was blank/scene-heading/killbox/episode AND line is ALL CAPS
 *     AND length < 50 AND not INT/EXT/FADE/CUT/DISSOLVE → 'character'
 * 12. Previous line type was character/parenthetical/dialogue → 'dialogue'
 * 13. Everything else → 'action'
 *
 * The token() function calls stream.skipToEnd() and returns a single style tag.
 * The style tag is the FountainElement value (e.g. 'scene-heading').
 * CM6's tag system maps these to CSS classes via className.
 */

function startState(): FountainParserState {
  return {
    prevLineType: null,
    prevLineBlank: false,
    consecutiveBlanks: 0,
    inTitlePage: true, // Start in title page mode
    inBoneyard: false,
    currentEpisode: 0,
  }
}

function copyState(state: FountainParserState): FountainParserState {
  return { ...state }
}

function blankLine(state: FountainParserState): void {
  if (state.inTitlePage) state.inTitlePage = false
  state.prevLineBlank = true
  state.consecutiveBlanks++
  state.prevLineType = FountainElement.Blank
}

function token(stream: StringStream, state: FountainParserState): string | null {
  const line = stream.string
  const trimmed = line.trim()

  stream.skipToEnd()

  // Empty line — handled by blankLine(), but token() is also called.
  // If the line is truly empty, return null (no styling).
  if (trimmed === '') {
    // blankLine() already handles state updates for truly blank lines,
    // but CM6 calls token() even for blank lines sometimes.
    // State is updated in blankLine() callback. Return null.
    return null
  }

  // From here, the line has content. Reset blank tracking.
  const wasPrevBlank = state.prevLineBlank
  const prevType = state.prevLineType
  state.prevLineBlank = false
  state.consecutiveBlanks = 0

  // ── 1. Boneyard continuation ──
  if (state.inBoneyard) {
    if (trimmed.includes('*/')) {
      state.inBoneyard = false
    }
    state.prevLineType = FountainElement.Boneyard
    return FountainElement.Boneyard
  }

  // ── 2. Title page mode ──
  if (state.inTitlePage) {
    if (trimmed === '===') {
      state.inTitlePage = false
      state.prevLineType = FountainElement.PageBreak
      return FountainElement.PageBreak
    }
    // Key: Value line
    if (/^\w[\w\s]*:/.test(trimmed)) {
      state.prevLineType = FountainElement.TitlePageKey
      return FountainElement.TitlePageKey
    }
    // Continuation value (indented or plain text after a key)
    state.prevLineType = FountainElement.TitlePageValue
    return FountainElement.TitlePageValue
  }

  // ── 3. Boneyard opening ──
  if (trimmed.startsWith('/*')) {
    state.inBoneyard = !trimmed.includes('*/')
    state.prevLineType = FountainElement.Boneyard
    return FountainElement.Boneyard
  }

  // ── 4. Forced elements (check BEFORE standard rules) ──
  if (trimmed.startsWith('@')) {
    state.prevLineType = FountainElement.Character
    return FountainElement.Character
  }
  if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.') {
    state.prevLineType = FountainElement.SceneHeading
    return FountainElement.SceneHeading
  }
  if (trimmed.startsWith('!')) {
    state.prevLineType = FountainElement.Action
    return FountainElement.Action
  }
  if (trimmed.startsWith('>') && trimmed.endsWith('<')) {
    state.prevLineType = FountainElement.CenteredText
    return FountainElement.CenteredText
  }
  if (trimmed.startsWith('>')) {
    state.prevLineType = FountainElement.Transition
    return FountainElement.Transition
  }

  // ── 4f. Lyrics ──
  if (trimmed.startsWith('~')) {
    state.prevLineType = FountainElement.Lyric
    return FountainElement.Lyric
  }

  // ── 5. Page break ──
  if (trimmed === '===') {
    state.prevLineType = FountainElement.PageBreak
    return FountainElement.PageBreak
  }

  // ── 6. Episode boundary (Recoil-specific) ──
  if (/^\[\[EPISODE\s+\d+/i.test(trimmed)) {
    const epMatch = trimmed.match(/EPISODE\s+(\d+)/i)
    if (epMatch) {
      state.currentEpisode = Number.parseInt(epMatch[1], 10)
    }
    state.prevLineType = FountainElement.EpisodeBoundary
    return FountainElement.EpisodeBoundary
  }

  // ── 7. Killbox section ──
  if (/^#\s*\[\d+:\d+\s*-\s*\d+:\d+\]/.test(trimmed)) {
    state.prevLineType = FountainElement.KillboxSection
    return FountainElement.KillboxSection
  }

  // ── 8. Scene heading ──
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) {
    state.prevLineType = FountainElement.SceneHeading
    return FountainElement.SceneHeading
  }

  // ── 9. Transition ──
  if (/^(FADE|CUT|DISSOLVE|SMASH)/i.test(trimmed) || /TO:$/i.test(trimmed)) {
    state.prevLineType = FountainElement.Transition
    return FountainElement.Transition
  }

  // ── 10. Parenthetical ──
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    state.prevLineType = FountainElement.Parenthetical
    return FountainElement.Parenthetical
  }

  // ── 11. Character name ──
  // Must follow a blank line, scene heading, killbox, or episode boundary.
  // Must be ALL CAPS, < 50 chars, not a scene heading or transition keyword.
  // Must NOT end with sentence punctuation (excludes ALL CAPS action lines).
  const afterBreak =
    prevType === null ||
    prevType === FountainElement.Blank ||
    prevType === FountainElement.SceneHeading ||
    prevType === FountainElement.KillboxSection ||
    prevType === FountainElement.EpisodeBoundary ||
    prevType === FountainElement.PageBreak ||
    wasPrevBlank
  const coreName = trimmed.replace(/\s*\(.*\)$/, '')
  if (
    afterBreak &&
    /^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(trimmed) &&
    trimmed.length < 50 &&
    !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(trimmed) &&
    !/[.!?]$/.test(coreName)
  ) {
    state.prevLineType = FountainElement.Character
    return FountainElement.Character
  }

  // ── 12. Dialogue (follows character, parenthetical, or dialogue) ──
  if (
    prevType === FountainElement.Character ||
    prevType === FountainElement.Parenthetical ||
    prevType === FountainElement.Dialogue
  ) {
    state.prevLineType = FountainElement.Dialogue
    return FountainElement.Dialogue
  }

  // ── 13. Default: action ──
  state.prevLineType = FountainElement.Action
  return FountainElement.Action
}

/**
 * The Fountain language extension for CodeMirror 6.
 * Uses StreamLanguage (NOT Lezer grammar).
 */
export const fountainLanguage = StreamLanguage.define<FountainParserState>({
  startState,
  copyState,
  token,
  blankLine,
  languageData: {
    commentTokens: { block: { open: '/*', close: '*/' } },
  },
})
