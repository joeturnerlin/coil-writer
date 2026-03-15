/**
 * StatusLog — console-like log at the bottom of the Analyze panel.
 * Auto-scrolls to latest entry.
 */

import { useEffect, useRef } from 'react'
import type { LogLevel } from '../store/status-log-store'
import { useStatusLog } from '../store/status-log-store'

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'var(--text-muted)',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  progress: 'var(--accent-cyan, #00f0ff)',
}

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info: '·',
  success: '✓',
  warning: '⚠',
  error: '✗',
  progress: '⟳',
}

export function StatusLog() {
  const entries = useStatusLog((s) => s.entries)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-color)',
        height: '100px',
        minHeight: '100px',
        overflowY: 'auto',
        padding: '6px 10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        lineHeight: '1.7',
        background: 'var(--bg-primary)',
      }}
    >
      {entries.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '4px 0' }}>Ready</div>
      )}
      {entries.map((e) => (
        <div key={e.id} style={{ color: LEVEL_COLORS[e.level] }}>
          <span style={{ color: 'var(--text-dim)' }}>{e.time}</span> <span>{LEVEL_PREFIX[e.level]}</span> {e.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
