import { EditorView } from '@codemirror/view'
import { CornerDownRight, Sparkles, Trash2, Type } from 'lucide-react'
import { useEditorStore } from '../store/editor-store'
import type { Revision } from '../store/revision-store'
import { REVISION_COLORS, useRevisionStore } from '../store/revision-store'

interface RevisionCardProps {
  revision: Revision
}

export function RevisionCard({ revision }: RevisionCardProps) {
  const { removeRevision } = useRevisionStore()
  const { viewRef } = useEditorStore()

  const passColor = REVISION_COLORS.find((c) => c.pass === revision.revisionPass)?.color ?? '#4fc3f7'
  const isAI = revision.type === 'ai-rewrite'

  const handleGoTo = () => {
    const view = viewRef?.current
    if (!view) return
    const pos = Math.min(revision.from, view.state.doc.length)
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center', yMargin: 50 }),
    })
    view.focus()
  }

  const truncate = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '...' : text)

  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  }

  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'background 0.1s ease',
      }}
      onClick={handleGoTo}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Type badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '1px 6px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              borderRadius: '3px',
              background: isAI ? 'rgba(79, 195, 247, 0.15)' : 'rgba(255, 152, 0, 0.15)',
              color: isAI ? '#4fc3f7' : '#ff9800',
              border: `1px solid ${isAI ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
            }}
          >
            {isAI ? <Sparkles size={8} /> : <Type size={8} />}
            {isAI ? 'AI' : 'EDIT'}
          </span>

          {/* Line number */}
          <span style={{ ...labelStyle, color: 'var(--text-dim)' }}>L{revision.lineNumber}</span>

          {/* Revision pass dot */}
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: passColor,
              display: 'inline-block',
            }}
            title={`Pass ${revision.revisionPass}`}
          />
        </div>

        {/* Delete button */}
        <button
          style={{
            padding: '2px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            display: 'flex',
            opacity: 0.5,
          }}
          onClick={(e) => {
            e.stopPropagation()
            removeRevision(revision.id)
          }}
          type="button"
          title="Remove revision entry"
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* Original text (struck through) */}
      <div
        style={{
          fontSize: '10px',
          fontFamily: "'Courier Prime', monospace",
          color: 'var(--text-dim)',
          textDecoration: 'line-through',
          lineHeight: '1.5',
          marginBottom: '4px',
        }}
      >
        {truncate(revision.originalText, 120)}
      </div>

      {/* Arrow + New text */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
        <CornerDownRight size={10} style={{ color: passColor, flexShrink: 0, marginTop: '2px' }} />
        <div
          style={{
            fontSize: '10px',
            fontFamily: "'Courier Prime', monospace",
            color: 'var(--text-primary)',
            lineHeight: '1.5',
          }}
        >
          {truncate(revision.newText, 120)}
        </div>
      </div>

      {/* Timestamp */}
      <div
        style={{
          fontSize: '8px',
          fontFamily: "'Inter', sans-serif",
          color: 'var(--text-dim)',
          marginTop: '4px',
        }}
      >
        {new Date(revision.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}
