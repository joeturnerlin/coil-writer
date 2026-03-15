/**
 * Page break indicator lines — draws dashed horizontal rules
 * at every ~55 lines to show where page boundaries fall.
 *
 * Standard screenplay: ~55 lines per page (Courier 12pt, 1" margins).
 * This is a visual aid only — does not affect print pagination.
 */

import type { Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

const LINES_PER_PAGE = 55

const pageBreakDeco = Decoration.line({ class: 'cm-page-break-line' })

function computePageBreaks(view: EditorView): DecorationSet {
  const doc = view.state.doc
  const totalLines = doc.lines
  const decos: { from: number }[] = []

  for (let pageEnd = LINES_PER_PAGE; pageEnd <= totalLines; pageEnd += LINES_PER_PAGE) {
    const line = doc.line(pageEnd)
    decos.push({ from: line.from })
  }

  return Decoration.set(decos.map((d) => pageBreakDeco.range(d.from)))
}

const pageBreakPlugin = ViewPlugin.define(
  (view) => ({
    decorations: computePageBreaks(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = computePageBreaks(update.view)
      }
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
)

const pageBreakTheme = EditorView.baseTheme({
  '.cm-page-break-line': {
    borderBottom: '1px dashed var(--page-break-color, rgba(255, 255, 255, 0.08))',
    paddingBottom: '8px',
    marginBottom: '8px',
  },
})

export function pageBreakLinesExtension(): Extension {
  return [pageBreakPlugin, pageBreakTheme]
}
