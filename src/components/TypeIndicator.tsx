import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'

/**
 * Fixed indicator showing the current line's Fountain element type.
 * Positioned in the bottom status bar area, right-aligned.
 * Auto-hides after 3 seconds of inactivity.
 */
export function TypeIndicator() {
  const { cursorLine, content } = useEditorStore()
  const { showEpisodeNav } = useSettingsStore()
  const [lineType, setLineType] = useState<string>('action')
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!content) return

    const lines = content.split('\n')
    const line = lines[cursorLine - 1]?.trim() ?? ''

    // Quick classification (mirrors parser logic)
    let type = 'action'
    if (
      /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(line) ||
      (line.startsWith('.') && line.length > 1 && line[1] !== '.')
    ) {
      type = 'scene heading'
    } else if (
      line.startsWith('@') ||
      (/^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(line) &&
        line.length < 50 &&
        line.length > 0 &&
        !/[.!?]$/.test(line.replace(/\s*\(.*\)$/, '')))
    ) {
      type = 'character'
    } else if (line.startsWith('(') && line.endsWith(')')) {
      type = 'parenthetical'
    } else if (/^(FADE|CUT|DISSOLVE|SMASH)/i.test(line) || /TO:$/i.test(line) || line.startsWith('>')) {
      type = 'transition'
    } else if (/^\[\[EPISODE/i.test(line)) {
      type = 'episode'
    } else if (/^#\s*\[\d+:\d+/.test(line)) {
      type = 'killbox'
    } else if (line === '===') {
      type = 'page break'
    } else if (line === '') {
      type = ''
    }

    setLineType(type)
    setVisible(true)

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), 3000)
  }, [cursorLine, content])

  if (!visible || !lineType) return null

  // Position: anchored to bottom-right, above the stats bar
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '16px',
        padding: '3px 10px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: 'var(--bg-tertiary)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border-color)',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
        fontFamily: "'Inter', -apple-system, sans-serif",
        zIndex: 20,
      }}
    >
      {lineType}
      <span style={{ marginLeft: '8px', fontWeight: 400, color: 'var(--text-dim)' }}>— Tab to cycle</span>
    </div>
  )
}
