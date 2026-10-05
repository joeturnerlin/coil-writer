import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search'
import type { EditorState } from '@codemirror/state'
import { type EditorView, type Panel, type ViewUpdate, runScopeHandlers } from '@codemirror/view'

/** Stop counting here — keeps a one-letter search in a long script cheap. */
export const MATCH_COUNT_CAP = 1000

export interface MatchCount {
  total: number
  /** 1-based position of the match the selection sits on; 0 if the selection is not on a match. */
  current: number
  capped: boolean
}

/** Count matches of `query` in `state` (pure; no view needed). */
export function countMatches(state: EditorState, query: SearchQuery, cap = MATCH_COUNT_CAP): MatchCount {
  const result: MatchCount = { total: 0, current: 0, capped: false }
  if (!query.search || !query.valid) return result
  const sel = state.selection.main
  const cursor = query.getCursor(state)
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    if (result.total >= cap) {
      result.capped = true
      break
    }
    result.total++
    if (step.value.from === sel.from && step.value.to === sel.to) result.current = result.total
  }
  return result
}

/** Plain-words label for the match counter. */
export function formatMatchCount(query: SearchQuery, count: MatchCount): string {
  if (!query.search) return ''
  if (!query.valid) return 'Invalid pattern'
  if (count.total === 0) return 'No matches'
  const total = count.capped ? `${count.total}+` : `${count.total}`
  if (count.current) return `${count.current} of ${total}`
  return `${total} ${count.total === 1 && !count.capped ? 'match' : 'matches'}`
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text) node.textContent = text
  return node
}

/** Find & Replace panel with plainly-labelled option toggles and a match counter. Styled in globals.css (.coil-find). */
export function createFindPanel(view: EditorView): Panel {
  const dom = el('div', { class: 'coil-find', role: 'search' })

  const findInput = el('input', {
    class: 'coil-find-input',
    type: 'text',
    placeholder: 'Find',
    'aria-label': 'Find',
    'main-field': 'true',
    spellcheck: 'false',
  })
  const replaceInput = el('input', {
    class: 'coil-find-input',
    type: 'text',
    placeholder: 'Replace with',
    'aria-label': 'Replace with',
    spellcheck: 'false',
  })
  const counter = el('span', { class: 'coil-find-count', 'aria-live': 'polite' })

  const button = (label: string, title: string, onClick: () => void) => {
    const b = el('button', { type: 'button', title }, label)
    b.addEventListener('click', onClick)
    return b
  }
  const toggle = (label: string, title: string, key: 'caseSensitive' | 'wholeWord' | 'regexp') => {
    const b = el('button', { type: 'button', class: 'coil-find-toggle', title, 'aria-pressed': 'false' }, label)
    b.addEventListener('click', () => commit({ [key]: !getSearchQuery(view.state)[key] }))
    return { b, key }
  }
  const toggles = [
    toggle('Match case', 'Match upper/lower case exactly', 'caseSensitive'),
    toggle('Whole word', 'Only match whole words', 'wholeWord'),
    toggle('Regex', 'Treat the search as a regular expression', 'regexp'),
  ]

  function commit(patch: Partial<Pick<SearchQuery, 'caseSensitive' | 'wholeWord' | 'regexp'>> = {}) {
    const cur = getSearchQuery(view.state)
    const next = new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: patch.caseSensitive ?? cur.caseSensitive,
      wholeWord: patch.wholeWord ?? cur.wholeWord,
      regexp: patch.regexp ?? cur.regexp,
    })
    if (!next.eq(cur)) view.dispatch({ effects: setSearchQuery.of(next) })
  }

  function refresh() {
    const q = getSearchQuery(view.state)
    if (findInput.value !== q.search) findInput.value = q.search
    if (replaceInput.value !== q.replace) replaceInput.value = q.replace
    for (const { b, key } of toggles) b.setAttribute('aria-pressed', String(q[key]))
    counter.textContent = formatMatchCount(q, countMatches(view.state, q))
  }

  const onKey = (e: KeyboardEvent, enter: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      enter()
    } else if (runScopeHandlers(view, e, 'search-panel')) {
      e.preventDefault()
    }
  }
  findInput.addEventListener('keydown', (e) => onKey(e, () => (e.shiftKey ? findPrevious(view) : findNext(view))))
  replaceInput.addEventListener('keydown', (e) => onKey(e, () => replaceNext(view)))
  findInput.addEventListener('input', () => commit())
  replaceInput.addEventListener('input', () => commit())

  const findRow = el('div', { class: 'coil-find-row' })
  findRow.append(
    findInput,
    button('Previous', 'Previous match (Shift+Enter)', () => findPrevious(view)),
    button('Next', 'Next match (Enter)', () => findNext(view)),
    button('Select all', 'Select every match', () => selectMatches(view)),
    ...toggles.map((t) => t.b),
    counter,
  )
  const replaceRow = el('div', { class: 'coil-find-row' })
  replaceRow.append(
    replaceInput,
    button('Replace', 'Replace this match (Enter)', () => replaceNext(view)),
    button('Replace all', 'Replace every match', () => replaceAll(view)),
  )
  // Close sits in the (shorter) replace row, in the flow, so it can never cover the option toggles above.
  const close = button('Close', 'Close (Esc)', () => closeSearchPanel(view))
  close.classList.add('coil-find-close')
  replaceRow.append(close)
  dom.append(findRow, replaceRow)

  refresh()

  return {
    dom,
    top: true,
    mount() {
      findInput.focus()
      findInput.select()
    },
    update(_update: ViewUpdate) {
      refresh()
    },
  }
}
