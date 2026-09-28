import { EditorView } from '@codemirror/view'

/**
 * Move the cursor to `pos` and scroll that line to the top of the view.
 * CodeMirror's scrollIntoView scrolls whichever element actually scrolls
 * (the editor, or the page around it), unlike scrollDOM.scrollTo.
 */
export function jumpTo(view: EditorView, pos: number, margin = 10): void {
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: margin }),
  })
  view.focus()
}

function scrollContainer(view: EditorView): Element | null {
  for (let el: HTMLElement | null = view.scrollDOM; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el
  }
  return null
}

/** Document position of the first line visible at the top of the editor. */
export function topVisiblePos(view: EditorView): number {
  const container = scrollContainer(view)
  const viewportTop = container ? container.getBoundingClientRect().top : 0
  return view.lineBlockAtHeight(Math.max(0, viewportTop - view.documentTop)).from
}

/** Call `handler` whenever the editor's visible region scrolls, whatever scrolls it. */
export function onEditorScroll(handler: () => void): () => void {
  document.addEventListener('scroll', handler, { capture: true, passive: true })
  return () => document.removeEventListener('scroll', handler, { capture: true })
}
