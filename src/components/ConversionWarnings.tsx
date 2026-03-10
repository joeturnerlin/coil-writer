import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import type { ConversionWarning } from '../lib/converters/types'

interface ConversionWarningsProps {
  warnings: ConversionWarning[]
  format: string
  onDismiss: () => void
}

export function ConversionWarnings({ warnings, format, onDismiss }: ConversionWarningsProps) {
  const [expanded, setExpanded] = useState(false)

  if (warnings.length === 0) return null

  const errorCount = warnings.filter((w) => w.severity === 'error').length
  const warningCount = warnings.filter((w) => w.severity === 'warning').length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 16px',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-color)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertTriangle size={14} style={{ color: errorCount > 0 ? '#f87171' : '#fbbf24' }} />
        <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
          Imported {format.toUpperCase()} with {warnings.length} notice{warnings.length !== 1 ? 's' : ''}
          {errorCount > 0 && (
            <span style={{ color: '#f87171' }}>
              {' '}
              ({errorCount} error{errorCount !== 1 ? 's' : ''})
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ color: '#fbbf24' }}>
              {' '}
              ({warningCount} warning{warningCount !== 1 ? 's' : ''})
            </span>
          )}
        </span>
        <button
          style={{
            padding: '2px 8px',
            fontSize: '10px',
            fontFamily: 'inherit',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--btn-radius)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '2px',
          }}
          onClick={onDismiss}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
          {warnings.map((w, i) => (
            <div
              key={i}
              style={{
                padding: '4px 0',
                color:
                  w.severity === 'error' ? '#f87171' : w.severity === 'warning' ? '#fbbf24' : 'var(--text-muted)',
                borderBottom: i < warnings.length - 1 ? '1px solid var(--border-color)' : undefined,
              }}
            >
              {w.line ? `L${w.line}: ` : ''}
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
