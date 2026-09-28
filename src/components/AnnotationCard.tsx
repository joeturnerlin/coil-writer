import { removeAnnotation } from '../editor/annotation-state'
import type { Annotation } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'

const ACTION_BADGE: Record<string, { dark: string; light: string }> = {
  rewrite: { dark: 'badge-rewrite-dark', light: 'badge-rewrite-light' },
  delete: { dark: 'badge-delete-dark', light: 'badge-delete-light' },
  move: { dark: 'badge-move-dark', light: 'badge-move-light' },
  flag: { dark: 'badge-flag-dark', light: 'badge-flag-light' },
}

const SEVERITY_BADGE: Record<string, { dark: string; light: string }> = {
  P1: { dark: 'badge-p1-dark', light: 'badge-p1-light' },
  P2: { dark: 'badge-p2-dark', light: 'badge-p2-light' },
  P3: { dark: 'badge-p3-dark', light: 'badge-p3-light' },
}

function deriveLocation(annotation: Annotation, content: string | null): string {
  if (!content) return ''
  const before = content.slice(0, annotation.from)
  const lineNumber = before.split('\n').length

  // Find episode
  const episodeMatches = [...before.matchAll(/\[\[EPISODE\s+(\d+)/gi)]
  const epNum = episodeMatches.length > 0 ? Number.parseInt(episodeMatches[episodeMatches.length - 1][1], 10) : null

  return epNum !== null ? `EP ${String(epNum).padStart(2, '0')} · Line ${lineNumber}` : `Line ${lineNumber}`
}

interface AnnotationCardProps {
  annotation: Annotation
}

export function AnnotationCard({ annotation }: AnnotationCardProps) {
  const { viewRef, content } = useEditorStore()
  const { selectedId, setSelectedId, setEditingAnnotation } = useAnnotationStore()
  const { theme } = useSettingsStore()

  const isDark = theme === 'dark'
  const isSelected = selectedId === annotation.id
  const mode = isDark ? 'dark' : 'light'

  const location = deriveLocation(annotation, content)

  const handleGoTo = () => {
    const view = viewRef?.current
    if (!view) return
    view.dispatch({
      selection: { anchor: annotation.from, head: annotation.to },
      scrollIntoView: true,
    })
    view.focus()
    setSelectedId(annotation.id)
  }

  const handleEdit = () => {
    setEditingAnnotation(annotation)
  }

  const handleDelete = () => {
    const view = viewRef?.current
    if (!view) return
    view.dispatch({
      effects: removeAnnotation.of(annotation.id),
    })
  }

  const truncatedText =
    annotation.selectedText.length > 80 ? annotation.selectedText.slice(0, 80) + '...' : annotation.selectedText

  return (
    <div
      style={{
        background: isSelected ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
        border: `1px solid ${isSelected ? 'var(--accent-blue-text)' : 'var(--border-color)'}`,
        borderRadius: 'var(--card-radius)',
        padding: 'var(--card-padding)',
        marginLeft: 'var(--card-margin-x)',
        marginRight: 'var(--card-margin-x)',
        marginBottom: 'var(--card-margin-b)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
      onClick={handleGoTo}
    >
      {/* Location */}
      {location && (
        <div
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            color: 'var(--text-muted)',
            marginBottom: '8px',
            letterSpacing: '0.03em',
          }}
        >
          {location}
        </div>
      )}

      {/* Badge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <span
          className={ACTION_BADGE[annotation.action]?.[mode] || ''}
          style={{
            display: 'inline-block',
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: 'var(--btn-radius)',
            letterSpacing: '0.05em',
          }}
        >
          {annotation.action}
        </span>
        {annotation.severity && (
          <span
            className={SEVERITY_BADGE[annotation.severity]?.[mode] || ''}
            style={{
              display: 'inline-block',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 'var(--btn-radius)',
            }}
          >
            {annotation.severity}
          </span>
        )}
        {annotation.dimensions?.map((dim) => (
          <span key={dim} className="badge-dimension">
            {dim}
          </span>
        ))}
      </div>

      {/* Selected text */}
      <div
        style={{
          fontSize: '12px',
          fontStyle: 'italic',
          color: 'var(--text-secondary)',
          marginBottom: '8px',
          lineHeight: '1.5',
          fontFamily: "'Courier Prime', monospace",
        }}
      >
        &ldquo;{truncatedText}&rdquo;
      </div>

      {/* Comment */}
      {annotation.comment && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-primary)',
            marginBottom: '8px',
            lineHeight: '1.5',
          }}
        >
          {annotation.comment}
        </div>
      )}

      {/* Proposed text */}
      {annotation.proposedText && (
        <div
          style={{
            fontSize: '11px',
            paddingLeft: '10px',
            borderLeft: '2px solid var(--accent-blue-text)',
            color: 'var(--accent-blue-text)',
            marginBottom: '8px',
            lineHeight: '1.5',
            fontFamily: "'Courier Prime', monospace",
          }}
        >
          {annotation.proposedText}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
        {(['Go to', 'Edit', 'Delete'] as const).map((label) => (
          <button
            key={label}
            style={{
              padding: '4px 12px',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              borderRadius: 'var(--btn-radius)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: label === 'Delete' ? 'transparent' : 'var(--bg-hover)',
              border: `1px solid ${label === 'Delete' ? 'var(--border-color)' : 'var(--border-light)'}`,
              color: label === 'Delete' ? 'var(--text-muted)' : 'var(--text-primary)',
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (label === 'Go to') handleGoTo()
              else if (label === 'Edit') handleEdit()
              else handleDelete()
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
