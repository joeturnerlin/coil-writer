import { ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { LEFT_PANEL_DEFAULT, useSettingsStore } from '../store/settings-store'
import { ContextualLeftPanel } from './ContextualLeftPanel'

/**
 * Left sidebar shell: animated collapse/expand and a drag-resizable width.
 * The panel stays mounted while collapsed (hidden, non-focusable) so the width can transition.
 */
export function LeftPanelShell() {
  const { showEpisodeNav, leftPanelWidth, setLeftPanelWidth } = useSettingsStore()
  // Never squeeze the editor: leave room for a right panel (340px) plus a 480px editor; the stored width is kept.
  const shown = `min(${leftPanelWidth}px, max(160px, calc(100vw - 820px)))`
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const active = hover || dragging

  return (
    <div
      className={dragging ? undefined : 'left-panel-shell'}
      aria-hidden={!showEpisodeNav}
      style={{
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        width: showEpisodeNav ? shown : 0,
        visibility: showEpisodeNav ? 'visible' : 'hidden',
      }}
    >
      {/* Row flex so the panel stretches to the full column height (it did as a direct child before the shell) */}
      <div style={{ width: shown, flexShrink: 0, display: 'flex' }}>
        <ContextualLeftPanel />
      </div>
      <div
        title="Drag to resize, double-click to reset"
        data-testid="left-panel-resize-handle"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          touchAction: 'none',
          background: active ? 'var(--accent-cyan-dim)' : 'transparent',
          borderRight: active ? '1px solid var(--accent-cyan)' : '1px solid transparent',
          transition: 'background 0.1s ease',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDoubleClick={() => setLeftPanelWidth(LEFT_PANEL_DEFAULT)}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          // Start from the width on screen (the viewport clamp may show less than the stored width)
          const shown = e.currentTarget.parentElement?.getBoundingClientRect().width ?? leftPanelWidth
          drag.current = { startX: e.clientX, startWidth: Math.round(shown) }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (drag.current) setLeftPanelWidth(drag.current.startWidth + e.clientX - drag.current.startX)
        }}
        onPointerUp={(e) => {
          drag.current = null
          setDragging(false)
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragging(false)
        }}
      />
    </div>
  )
}

/** Small tab at the editor's upper-left that reopens a collapsed sidebar. */
export function LeftPanelReopenTab() {
  const toggleEpisodeNav = useSettingsStore((s) => s.toggleEpisodeNav)
  return (
    <button
      type="button"
      onClick={toggleEpisodeNav}
      title="Show scenes"
      aria-label="Show scenes"
      data-testid="left-panel-reopen"
      style={{
        position: 'absolute',
        top: '10px',
        left: 0,
        zIndex: 5,
        padding: '6px 2px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderLeft: 'none',
        borderRadius: '0 4px 4px 0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
    </button>
  )
}
