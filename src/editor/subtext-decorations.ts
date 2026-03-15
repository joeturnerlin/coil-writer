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

// ── Popover ──────────────────────────────────────────────

let activePopover: HTMLElement | null = null

const CATEGORY_LABELS: Record<string, string> = {
  'literal-emotion': 'Literal Emotion',
  'exposition-dump': 'Exposition Dump',
  'thematic-broadcasting': 'Thematic Broadcasting',
}

function showSubtextPopover(flag: SubtextFlag, anchor: HTMLElement) {
  if (activePopover) {
    activePopover.remove()
    activePopover = null
  }

  const popover = document.createElement('div')
  popover.style.cssText = `
    position: fixed; z-index: 60; width: 280px;
    background: var(--bg-tertiary, #1a1a2e); color: var(--text-primary, #e0e0e0);
    border: 1px solid var(--border-light, #333); border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); font-family: 'Inter', sans-serif;
    padding: 12px; font-size: 11px; line-height: 1.5;
  `

  const rect = anchor.getBoundingClientRect()
  popover.style.left = `${rect.right + 12}px`
  popover.style.top = `${rect.top - 8}px`

  const label = CATEGORY_LABELS[flag.category] || flag.category
  const conf = flag.confidence === 'high' ? '#ef5350' : '#ff9800'

  popover.innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
      <span style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${conf};">${label}</span>
      <span style="font-size:9px; padding:1px 6px; border-radius:3px; background:${conf}22; color:${conf}; font-weight:600;">${flag.confidence}</span>
    </div>
    <div style="color:var(--text-secondary, #aaa); margin-bottom:8px;">${flag.explanation}</div>
    ${flag.suggestion ? `<div style="padding:8px; border-radius:4px; background:var(--bg-hover, #222); font-style:italic; color:var(--text-muted, #888); font-size:10px;"><span style="font-style:normal; font-weight:600; color:var(--text-secondary, #aaa);">Try:</span> ${flag.suggestion}</div>` : ''}
  `

  document.body.appendChild(popover)
  activePopover = popover

  // Clamp to viewport
  requestAnimationFrame(() => {
    const pr = popover.getBoundingClientRect()
    if (pr.right > window.innerWidth - 8) {
      popover.style.left = `${rect.left - pr.width - 12}px`
    }
    if (pr.bottom > window.innerHeight - 8) {
      popover.style.top = `${window.innerHeight - pr.height - 8}px`
    }
  })

  const dismiss = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) {
      popover.remove()
      activePopover = null
      document.removeEventListener('click', dismiss)
    }
  }
  setTimeout(() => document.addEventListener('click', dismiss), 0)
}

// ── Gutter Marker ────────────────────────────────────────

class SubtextDot extends GutterMarker {
  constructor(public flag: SubtextFlag) {
    super()
  }

  toDOM() {
    // Outer element = 20px hit target
    const wrapper = document.createElement('div')
    wrapper.style.width = '20px'
    wrapper.style.height = '20px'
    wrapper.style.display = 'flex'
    wrapper.style.alignItems = 'center'
    wrapper.style.justifyContent = 'center'
    wrapper.style.cursor = 'pointer'
    wrapper.style.margin = 'auto'

    // Inner dot = 10px visible dot
    const dot = document.createElement('div')
    dot.style.width = '10px'
    dot.style.height = '10px'
    dot.style.borderRadius = '50%'
    dot.style.background = 'var(--subtext-dot)'
    dot.style.opacity = this.flag.confidence === 'high' ? '0.9' : '0.5'
    dot.style.boxShadow = this.flag.confidence === 'high' ? '0 0 4px var(--subtext-dot)' : 'none'

    wrapper.title = `${this.flag.category}: ${this.flag.explanation}`
    wrapper.appendChild(dot)
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation()
      showSubtextPopover(this.flag, wrapper)
    })
    return wrapper
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
    width: '22px',
    minWidth: '22px',
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
