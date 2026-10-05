import { SearchQuery } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { expect, test } from 'vitest'
import { countMatches, formatMatchCount } from '../src/editor/find-panel'

const state = (doc: string, sel?: [number, number]) =>
  EditorState.create({ doc, selection: sel ? EditorSelection.single(sel[0], sel[1]) : undefined })

test('counts matches and locates the selected one', () => {
  const q = new SearchQuery({ search: 'cat' })
  const c = countMatches(state('cat bat cat', [8, 11]), q)
  expect(c).toEqual({ total: 2, current: 2, capped: false })
  expect(formatMatchCount(q, c)).toBe('2 of 2')
})

test('case, whole-word and regex toggles change the count', () => {
  const s = state('Cat cat concat')
  expect(countMatches(s, new SearchQuery({ search: 'cat' })).total).toBe(3)
  expect(countMatches(s, new SearchQuery({ search: 'cat', caseSensitive: true })).total).toBe(2)
  expect(countMatches(s, new SearchQuery({ search: 'cat', wholeWord: true })).total).toBe(2)
  expect(countMatches(s, new SearchQuery({ search: 'c.t', regexp: true })).total).toBe(3)
})

test('labels: empty, none, invalid regex, unselected, capped', () => {
  const s = state('aaaa')
  expect(formatMatchCount(new SearchQuery({ search: '' }), countMatches(s, new SearchQuery({ search: '' })))).toBe('')
  const none = new SearchQuery({ search: 'z' })
  expect(formatMatchCount(none, countMatches(s, none))).toBe('No matches')
  const bad = new SearchQuery({ search: '(', regexp: true })
  expect(formatMatchCount(bad, countMatches(s, bad))).toBe('Invalid pattern')
  const a = new SearchQuery({ search: 'a' })
  expect(formatMatchCount(a, countMatches(s, a))).toBe('4 matches')
  const capped = countMatches(s, a, 2)
  expect(capped).toEqual({ total: 2, current: 0, capped: true })
  expect(formatMatchCount(a, capped)).toBe('2+ matches')
})
