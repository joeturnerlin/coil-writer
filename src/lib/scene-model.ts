/**
 * Scene Document Model — structured scene-level representation.
 *
 * Pure functions. No AI. Runs on main thread (Fountain files are small).
 * 7 of 9 features depend on this.
 */

export interface SceneBlock {
  index: number
  heading: string
  from: number // absolute character position in document
  to: number // start of next scene or EOF
  content: string
  characters: string[] // unique character names in this scene
  dialogueLines: number
  actionLines: number
  wordCount: number
  dialogueWordCount: number
}

/**
 * Parse a Fountain document into scene blocks.
 * Returns one block per scene heading. Content before the first heading
 * is returned as a block with heading '' and index 0.
 */
export function parseSceneBlocks(content: string): SceneBlock[] {
  const lines = content.split('\n')
  const blocks: SceneBlock[] = []
  let sceneIndex = 0

  // Regex for standard Fountain scene headings
  const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*.+/i
  const FORCED_HEADING_RE = /^\.[^.].*/

  const headingPositions: { heading: string; pos: number }[] = []

  // First pass: find all scene heading positions
  let pos = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (SCENE_HEADING_RE.test(trimmed) || FORCED_HEADING_RE.test(trimmed)) {
      const heading = FORCED_HEADING_RE.test(trimmed) ? trimmed.slice(1).trim() : trimmed
      headingPositions.push({ heading, pos })
    }
    pos += lines[i].length + 1
  }

  // If no headings, return entire document as one block
  if (headingPositions.length === 0) {
    return [buildBlock(0, '', 0, content.length, content)]
  }

  // Pre-heading content (title page, leading whitespace, etc.)
  if (headingPositions[0].pos > 0) {
    const preContent = content.slice(0, headingPositions[0].pos)
    blocks.push(buildBlock(0, '', 0, headingPositions[0].pos, preContent))
    sceneIndex = 1
  }

  // Build blocks between headings
  for (let i = 0; i < headingPositions.length; i++) {
    const from = headingPositions[i].pos
    const to = i + 1 < headingPositions.length ? headingPositions[i + 1].pos : content.length
    const blockContent = content.slice(from, to)
    blocks.push(buildBlock(sceneIndex + i, headingPositions[i].heading, from, to, blockContent))
  }

  return blocks
}

/**
 * Reconstruct a full document from scene blocks.
 */
export function reconstructFromBlocks(blocks: SceneBlock[]): string {
  return blocks.map((b) => b.content).join('')
}

// ── Internal helpers ──

function buildBlock(index: number, heading: string, from: number, to: number, content: string): SceneBlock {
  const lines = content.split('\n')
  const characters = new Set<string>()
  let dialogueLines = 0
  let actionLines = 0
  let dialogueWordCount = 0
  let prevType: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      prevType = 'blank'
      continue
    }

    // Scene heading
    if (
      /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed) ||
      (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.')
    ) {
      prevType = 'heading'
      continue
    }

    // Character cue
    const afterBreak = prevType === null || prevType === 'blank' || prevType === 'heading'
    if (
      afterBreak &&
      /^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(trimmed) &&
      trimmed.length < 50 &&
      !/[.!?]$/.test(trimmed.replace(/\s*\(.*\)$/, ''))
    ) {
      const charName = trimmed.replace(/\s*\(.*\)$/, '').trim()
      characters.add(charName)
      prevType = 'character'
      continue
    }

    // Parenthetical
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      prevType = 'parenthetical'
      dialogueLines++
      dialogueWordCount += trimmed.split(/\s+/).filter(Boolean).length
      continue
    }

    // Dialogue
    if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
      prevType = 'dialogue'
      dialogueLines++
      dialogueWordCount += trimmed.split(/\s+/).filter(Boolean).length
      continue
    }

    // Action
    prevType = 'action'
    actionLines++
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length

  return {
    index,
    heading,
    from,
    to,
    content,
    characters: Array.from(characters),
    dialogueLines,
    actionLines,
    wordCount,
    dialogueWordCount,
  }
}
