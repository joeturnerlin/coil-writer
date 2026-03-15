/**
 * Subtext gutter decorations — amber dots on lines with on-the-nose dialogue.
 *
 * Dots are 6px circles. High-confidence flags are nearly opaque (0.9),
 * medium-confidence flags are semi-transparent (0.5).
 * Hover shows the category and explanation via native title tooltip.
 *
 * Not wired into the editor yet — Phase 2b will register this extension.
 */

import { RangeSet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { StateEffect, StateField } from '@codemirror/state'
import { EditorView, GutterMarker, gutter } from '@codemirror/view'
import type { SubtextFlag } from '../lib/subtext-analysis'

// ── Effects ──────────────────────────────────────────────

/** Replace all subtext flags with a new set */
export const setSubtextFlags = StateEffect.define<SubtextFlag[]>()

/** Clear all subtext flags */
export const clearSubtextFlags = StateEffect.define<void>()

// ── Gutter Marker ────────────────────────────────────────

class SubtextDot extends GutterMarker {
  constructor(public flag: SubtextFlag) {
    super()
  }

  toDOM() {
    const el = document.createElement('div')
    el.style.width = '6px'
    el.style.height = '6px'
    el.style.borderRadius = '50%'
    el.style.margin = 'auto'
    el.style.background = 'var(--subtext-dot)'
    el.style.opacity = this.flag.confidence === 'high' ? '0.9' : '0.5'
    el.title = `${this.flag.category}: ${this.flag.explanation}`
    return el
  }

  eq(other: SubtextDot) {
    return (
      this.flag.lineNumber === other.flag.lineNumber &&
      this.flag.confidence === other.flag.confidence &&
      this.flag.category === other.flag.category
    )
  }
}

// ── State Field ──────────────────────────────────────────

const subtextField = StateField.define<SubtextFlag[]>({
  create() {
    return []
  },

  update(state, tr) {
    let flags = state

    for (const effect of tr.effects) {
      if (effect.is(setSubtextFlags)) {
        flags = effect.value
      }
      if (effect.is(clearSubtextFlags)) {
        flags = []
      }
    }

    return flags
  },
})

// ── Gutter Extension ─────────────────────────────────────

const subtextGutter = gutter({
  class: 'cm-subtext-gutter',
  markers(view) {
    const flags = view.state.field(subtextField)
    const builder: { from: number; marker: GutterMarker }[] = []

    for (const flag of flags) {
      if (flag.lineNumber >= 1 && flag.lineNumber <= view.state.doc.lines) {
        const line = view.state.doc.line(flag.lineNumber)
        builder.push({ from: line.from, marker: new SubtextDot(flag) })
      }
    }

    // RangeSet needs sorted input
    builder.sort((a, b) => a.from - b.from)
    return RangeSet.of(builder.map((b) => b.marker.range(b.from)))
  },
})

const gutterTheme = EditorView.baseTheme({
  '.cm-subtext-gutter': {
    width: '12px',
    minWidth: '12px',
  },
  '.cm-subtext-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  },
})

// ── Public API ───────────────────────────────────────────

export const subtextExtension: Extension = [subtextField, subtextGutter, gutterTheme]
