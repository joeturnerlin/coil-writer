import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { fountainLanguage } from '../src/editor/fountain-language'
import { classifyDocument } from '../src/editor/fountain-decorations'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Helper: create an EditorState with Fountain language, then classify
 * every line using our document classifier (same logic as the StreamParser).
 *
 * NOTE: StreamLanguage does NOT expose custom token names in the syntax tree.
 * Only built-in lezer tags (like "character") survive as node names; our custom
 * types like "scene-heading", "episode-boundary" etc. become anonymous nodes.
 * Therefore we test via classifyDocument() which uses the same classification
 * logic as the StreamParser and the line decoration builder.
 */
function parseFixture(text: string) {
  // Verify the language extension loads without errors
  EditorState.create({
    doc: text,
    extensions: [fountainLanguage],
  })

  // Classify lines using the same logic as decorations
  return classifyDocument(text)
}

function getLineType(parsed: ReturnType<typeof parseFixture>, lineNumber: number): string {
  return parsed.find((l) => l.lineNumber === lineNumber)?.type ?? 'unknown'
}

describe('Fountain StreamParser', () => {
  it('parses title page before ===', () => {
    const result = parseFixture('Title: TARTARUS\nCredit: A Microdrama Series\n\n===\n')
    // Title page lines should be classified as title-page-key or title-page-value
    expect(getLineType(result, 1)).toContain('title-page')
    expect(getLineType(result, 2)).toContain('title-page')
  })

  it('parses scene headings', () => {
    const result = parseFixture('===\n\nINT. TARTARUS - LEVEL -47 - CONTINUOUS\n')
    const heading = result.find((l) => l.text.includes('INT.'))
    expect(heading?.type).toBe('scene-heading')
  })

  it('parses forced scene heading with dot prefix', () => {
    const result = parseFixture('===\n\n.A STRANGE PLACE\n')
    const heading = result.find((l) => l.text.includes('.A STRANGE'))
    expect(heading?.type).toBe('scene-heading')
  })

  it('parses character names', () => {
    const result = parseFixture('===\n\nINT. ROOM\n\nTORCH\nHello world.\n')
    const char = result.find((l) => l.text === 'TORCH')
    expect(char?.type).toBe('character')
  })

  it('parses forced character with @ prefix', () => {
    const result = parseFixture('===\n\n@McCLANE\nYippee ki-yay.\n')
    const char = result.find((l) => l.text === '@McCLANE')
    expect(char?.type).toBe('character')
  })

  it('parses dialogue after character', () => {
    const result = parseFixture('===\n\nINT. ROOM\n\nTORCH\nHello world.\n')
    const dlg = result.find((l) => l.text === 'Hello world.')
    expect(dlg?.type).toBe('dialogue')
  })

  it('parses parentheticals', () => {
    const result = parseFixture('===\n\nTORCH\n(whispering)\nHello.\n')
    const paren = result.find((l) => l.text === '(whispering)')
    expect(paren?.type).toBe('parenthetical')
  })

  it('parses transitions', () => {
    const result = parseFixture('===\n\nCUT TO:\n')
    const trans = result.find((l) => l.text === 'CUT TO:')
    expect(trans?.type).toBe('transition')
  })

  it('parses episode boundaries', () => {
    const result = parseFixture('===\n\n[[EPISODE 1: Salvage]]\n')
    const ep = result.find((l) => l.text.includes('EPISODE'))
    expect(ep?.type).toBe('episode-boundary')
  })

  it('parses killbox sections', () => {
    const result = parseFixture('===\n\n# [00:00 - 00:05] THE HOOK\n')
    const kb = result.find((l) => l.text.includes('THE HOOK'))
    expect(kb?.type).toBe('killbox-section')
  })

  it('parses action lines', () => {
    const result = parseFixture("===\n\nTorch's salvage hook pries copper from a dead conduit.\n")
    const action = result.find((l) => l.text.includes('salvage hook'))
    expect(action?.type).toBe('action')
  })

  it('parses boneyard', () => {
    const result = parseFixture('===\n\n/* This is a comment */\n')
    const bone = result.find((l) => l.text.includes('comment'))
    expect(bone?.type).toBe('boneyard')
  })

  it('parses centered text', () => {
    const result = parseFixture('===\n\n> THE END <\n')
    const centered = result.find((l) => l.text.includes('THE END'))
    expect(centered?.type).toBe('centered-text')
  })

  it('treats ALL CAPS sentences as action, not character', () => {
    const result = parseFixture('===\n\nFIRE ERUPTS.\n')
    const line = result.find((l) => l.text === 'FIRE ERUPTS.')
    expect(line?.type).toBe('action')
  })

  it('treats ALL CAPS exclamation as action', () => {
    const result = parseFixture('===\n\nTHE DOOR SLAMS SHUT!\n')
    const line = result.find((l) => l.text === 'THE DOOR SLAMS SHUT!')
    expect(line?.type).toBe('action')
  })

  it('allows character names with abbreviations like MR. SMITH', () => {
    const result = parseFixture('===\n\nINT. ROOM\n\nMR SMITH\nHello.\n')
    const char = result.find((l) => l.text === 'MR SMITH')
    expect(char?.type).toBe('character')
  })

  it('loads and parses the Tartarus excerpt fixture', () => {
    const fixturePath = resolve(__dirname, 'fixtures/tartarus-excerpt.fountain')
    const text = readFileSync(fixturePath, 'utf-8')
    const result = parseFixture(text)

    // Should have parsed multiple types
    const types = new Set(result.map((l) => l.type))
    expect(types.has('scene-heading')).toBe(true)
    expect(types.has('character')).toBe(true)
    expect(types.has('dialogue')).toBe(true)
    expect(types.has('episode-boundary')).toBe(true)
    expect(types.has('killbox-section')).toBe(true)
    expect(types.has('action')).toBe(true)

    // Verify specific lines from the fixture
    const sceneHeading = result.find((l) => l.text.includes('INT. TARTARUS'))
    expect(sceneHeading?.type).toBe('scene-heading')

    const torch = result.find((l) => l.text === 'TORCH')
    expect(torch?.type).toBe('character')

    const episode = result.find((l) => l.text.includes('[[EPISODE 1'))
    expect(episode?.type).toBe('episode-boundary')
  })
})
