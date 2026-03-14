/**
 * Scene number gutter — auto-numbers scene headings sequentially.
 *
 * Scans the document for lines matching scene heading patterns
 * (INT./EXT./INT./EXT./I/E. or forced . prefix with those patterns)
 * and displays sequential numbers (1, 2, 3...) in the gutter.
 */

import { RangeSet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, GutterMarker, gutter, ViewPlugin, type ViewUpdate } from '@codemirror/view'

const SCENE_HEADING_RE = /^\.?(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i

class SceneNumberMarker extends GutterMarker {
  constructor(readonly num: number) {
    super()
  }

  toDOM() {
    const el = document.createElement('span')
    el.textContent = String(this.num)
    el.className = 'cm-scene-number'
    return el
  }

  eq(other: SceneNumberMarker) {
    return this.num === other.num
  }
}

/** Compute scene numbers for the entire document. */
function computeSceneMarkers(view: EditorView): { from: number; marker: SceneNumberMarker }[] {
  const markers: { from: number; marker: SceneNumberMarker }[] = []
  let sceneCount = 0
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const trimmed = line.text.trim()
    if (SCENE_HEADING_RE.test(trimmed)) {
      sceneCount++
      markers.push({ from: line.from, marker: new SceneNumberMarker(sceneCount) })
    }
  }

  return markers
}

/** ViewPlugin that recomputes scene numbers on document changes. */
const sceneNumberPlugin = ViewPlugin.define(view => {
  let markers = computeSceneMarkers(view)
  return {
    get markers() { return markers },
    update(update: ViewUpdate) {
      if (update.docChanged) {
        markers = computeSceneMarkers(update.view)
      }
    },
  }
})

const sceneNumberGutter = gutter({
  class: 'cm-scene-number-gutter',
  markers(view) {
    const plugin = view.plugin(sceneNumberPlugin)
    if (!plugin) return RangeSet.empty
    return RangeSet.of(
      plugin.markers.map(m => m.marker.range(m.from))
    )
  },
})

const sceneNumberTheme = EditorView.baseTheme({
  '.cm-scene-number-gutter': {
    width: '28px',
    minWidth: '28px',
    textAlign: 'right',
    paddingRight: '4px',
  },
  '.cm-scene-number-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 4px 0 0',
  },
  '.cm-scene-number': {
    fontSize: '9px',
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--text-dim, #555)',
    opacity: '0.6',
    userSelect: 'none',
  },
})

export function sceneNumberGutterExtension(): Extension {
  return [sceneNumberPlugin, sceneNumberGutter, sceneNumberTheme]
}
