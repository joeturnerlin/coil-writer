/**
 * BeatBoard — read-only card visualization for Analyze mode.
 *
 * Vertical scrollable list of scene cards (180px panel width).
 * Each card shows scene heading, optional beat tag pill, optional summary.
 * Click scrolls editor to scene. No drag-to-rearrange.
 */

import { EditorView } from '@codemirror/view'
import { useCallback, useState } from 'react'
import type { SceneBlock } from '../lib/scene-model'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'

// ── Beat category colors (matches StructurePanel) ──

const CATEGORY_COLORS: Record<string, string> = {
  setup: '#4fc3f7',
  catalyst: '#ff9800',
  conflict: '#ef5350',
  resolution: '#4caf50',
}

const UNMAPPED_COLOR = 'var(--border-color)'

function beatColor(category?: string): string {
  return (category && CATEGORY_COLORS[category]) || UNMAPPED_COLOR
}

// ── Main component ──

export function BeatBoard() {
  const scenes = useScriptStore((s) => s.scenes)
  const viewRef = useEditorStore((s) => s.viewRef)

  const filteredScenes = scenes.filter((s) => s.heading)

  const scrollToScene = useCallback(
    (scene: SceneBlock) => {
      const view = viewRef?.current
      if (!view) return
      view.dispatch({
        selection: { anchor: scene.from },
        effects: EditorView.scrollIntoView(scene.from, { y: 'start', yMargin: 10 }),
      })
      const scroller = view.scrollDOM
      scroller.style.scrollBehavior = 'smooth'
      setTimeout(() => { scroller.style.scrollBehavior = '' }, 500)
      view.focus()
    },
    [viewRef],
  )

  if (filteredScenes.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        No scenes found
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {filteredScenes.map((scene) => (
        <BeatCard key={scene.index} scene={scene} onClick={() => scrollToScene(scene)} />
      ))}
    </div>
  )
}

// ── Beat card ──

function BeatCard({
  scene,
  onClick,
}: {
  scene: SceneBlock
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  // Left border color — unmapped by default (no structure analysis in BeatBoard)
  const borderColor = UNMAPPED_COLOR

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 'calc(100% - 8px)',
        textAlign: 'left',
        padding: '8px',
        margin: '0 4px 4px',
        border: '1px solid var(--border-color)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '4px',
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'background 0.1s ease',
      }}
    >
      {/* Scene heading */}
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '152px',
        }}
      >
        {scene.heading}
      </div>
    </button>
  )
}
