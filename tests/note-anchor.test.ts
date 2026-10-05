import { describe, expect, test } from 'vitest'
import type { Annotation } from '../src/editor/types'
import { anchorAnnotation, resolveAnchor } from '../src/lib/note-transfer'

const SCRIPT = ['INT. KITCHEN - DAY', '', 'ANNA', 'No.', '', 'BEN', 'No.', '', 'ANNA', 'Fine.'].join('\n')

function noteOn(content: string, nth: number, text: string): Annotation {
  let from = -1
  for (let i = 0; i <= nth; i++) from = content.indexOf(text, from + 1)
  return {
    id: 'a',
    from,
    to: from + text.length,
    selectedText: text,
    action: 'flag',
    comment: 'c',
    createdAt: '',
  } as Annotation
}

describe('resolveAnchor', () => {
  test('exact position still holds', () => {
    const a = noteOn(SCRIPT, 1, 'No.')
    const anchor = anchorAnnotation(a, SCRIPT)
    expect(resolveAnchor(anchor, a.from, a.to, a.selectedText, SCRIPT)).toMatchObject({
      confidence: 'exact',
      from: a.from,
    })
  })

  test('a unique contextual match survives an edit that shifts offsets', () => {
    const a = noteOn(SCRIPT, 1, 'No.')
    const anchor = anchorAnnotation(a, SCRIPT)
    const edited = `FADE IN:\n\n${SCRIPT}`
    const r = resolveAnchor(anchor, a.from, a.to, a.selectedText, edited)
    expect(r.confidence).not.toBe('orphaned')
    expect(r.confidence).not.toBe('ambiguous')
    expect(edited.slice(r.from, r.to)).toBe('No.')
    expect(edited.slice(r.from - 4, r.from)).toBe('BEN\n') // the second "No.", not the first
  })

  test('repeated "No." with changed context is ambiguous, never the first global match', () => {
    const a = noteOn(SCRIPT, 1, 'No.')
    const anchor = { ...anchorAnnotation(a, SCRIPT), anchorHeading: '', anchorContext: 'gone entirely' }
    const edited = 'NEW OPENING\n\nANNA\nNo.\n\nBEN\nNo.\n'
    const r = resolveAnchor(anchor, a.from, a.to, 'No.', edited)
    expect(r.confidence).toBe('ambiguous')
    expect(r.candidates).toHaveLength(2)
    expect(r.from).toBe(a.from) // original positions untouched: not moved onto a guess
  })

  test('same heading, text twice in its window: ambiguous', () => {
    const a = noteOn(SCRIPT, 1, 'No.')
    const anchor = { ...anchorAnnotation(a, SCRIPT), anchorContext: 'unrelated context text' }
    const edited = `${SCRIPT}\nMORE`
    // shift so exact fails
    const r = resolveAnchor(anchor, a.from + 1, a.to + 1, 'No.', edited)
    expect(r.confidence).toBe('ambiguous')
  })

  test('text deleted: orphaned', () => {
    const a = noteOn(SCRIPT, 0, 'Fine.')
    const anchor = anchorAnnotation(a, SCRIPT)
    expect(resolveAnchor(anchor, a.from, a.to, 'Fine.', 'INT. KITCHEN - DAY\n\nNothing here.').confidence).toBe(
      'orphaned',
    )
  })

  test('a lone text match without context is offered, not applied', () => {
    const anchor = { anchorHeading: '', anchorContext: 'zzz', anchorCharacter: '', fileName: '' }
    const r = resolveAnchor(anchor, 5, 9, 'unique line', 'abc\n\nunique line\n')
    expect(r).toMatchObject({ confidence: 'orphaned', from: 5, to: 9, candidates: [5] })
  })
})
