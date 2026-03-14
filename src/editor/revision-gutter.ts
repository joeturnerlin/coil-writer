/**
 * Revision gutter — shows asterisk marks on changed lines.
 *
 * Two sources of marks:
 * 1. AI rewrites — marked immediately when an AI suggestion is accepted
 * 2. Manual edits — marked when revision mode is on and the user types
 *
 * Marks persist until the revision pass is cleared.
 */

import { RangeSet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { StateEffect, StateField } from '@codemirror/state'
import { EditorView, GutterMarker, gutter } from '@codemirror/view'

// ── Effects ──────────────────────────────────────────────

/** Mark specific lines as changed (1-based line numbers) */
export const markLines = StateEffect.define<number[]>()

/** Clear all revision marks (new pass) */
export const clearRevisionMarks = StateEffect.define<void>()

// ── Gutter Marker ────────────────────────────────────────

class RevisionMark extends GutterMarker {
  constructor(readonly color: string) {
    super()
  }

  toDOM() {
    const el = document.createElement('span')
    el.textContent = '*'
    el.style.color = this.color
    el.style.fontWeight = '700'
    el.style.fontSize = '14px'
    el.style.lineHeight = '1'
    return el
  }

  eq(other: RevisionMark) {
    return this.color === other.color
  }
}

// ── State Field ──────────────────────────────────────────

/** Tracks which lines (1-based) have been modified and their mark color */
interface RevisionGutterState {
  /** Map of line number (1-based) → color */
  marks: Map<number, string>
}

const revisionGutterField = StateField.define<RevisionGutterState>({
  create() {
    return { marks: new Map() }
  },

  update(state, tr) {
    let marks = state.marks

    for (const effect of tr.effects) {
      if (effect.is(markLines)) {
        marks = new Map(marks)
        for (const lineNum of effect.value) {
          // Default color — can be overridden per-pass
          if (!marks.has(lineNum)) {
            marks.set(lineNum, '#4fc3f7') // blue by default
          }
        }
      }
      if (effect.is(clearRevisionMarks)) {
        marks = new Map()
      }
    }

    // Remap line numbers through document changes
    if (tr.docChanged && marks.size > 0) {
      const newMarks = new Map<number, string>()
      for (const [lineNum, color] of marks) {
        if (lineNum >= 1 && lineNum <= tr.startState.doc.lines) {
          const lineStart = tr.startState.doc.line(lineNum).from
          const newPos = tr.changes.mapPos(lineStart, 1)
          const newLine = tr.state.doc.lineAt(newPos).number
          newMarks.set(newLine, color)
        }
      }
      marks = newMarks
    }

    return marks === state.marks ? state : { marks }
  },
})

// ── Gutter Extension ─────────────────────────────────────

const revisionGutter = gutter({
  class: 'cm-revision-gutter',
  markers(view) {
    const state = view.state.field(revisionGutterField)
    const builder: { from: number; marker: GutterMarker }[] = []

    for (const [lineNum, color] of state.marks) {
      if (lineNum >= 1 && lineNum <= view.state.doc.lines) {
        const line = view.state.doc.line(lineNum)
        builder.push({ from: line.from, marker: new RevisionMark(color) })
      }
    }

    // RangeSet needs sorted input
    builder.sort((a, b) => a.from - b.from)
    return RangeSet.of(builder.map((b) => b.marker.range(b.from)))
  },
})

const gutterTheme = EditorView.baseTheme({
  '.cm-revision-gutter': {
    width: '12px',
    minWidth: '12px',
  },
  '.cm-revision-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  },
})

// ── Public API ───────────────────────────────────────────

export function revisionGutterExtension(): Extension {
  return [revisionGutterField, revisionGutter, gutterTheme]
}

/** Get current marked lines from an editor view */
export function getMarkedLines(view: EditorView): Map<number, string> {
  return view.state.field(revisionGutterField).marks
}
