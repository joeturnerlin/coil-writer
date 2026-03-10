import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addAnnotation, updateAnnotation } from '../editor/annotation-state'
import type { AnnotationAction, AnnotationSeverity } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'

interface AnnotationPopupProps {
  selection: { from: number; to: number; text: string } | null
  position: { x: number; y: number } | null
  onClose: () => void
  onAIRewrite?: () => void
}

export function AnnotationPopup({ selection, position, onClose, onAIRewrite }: AnnotationPopupProps) {
  const { viewRef } = useEditorStore()
  const { editingAnnotation, setEditingAnnotation } = useAnnotationStore()

  const [action, setAction] = useState<AnnotationAction>('rewrite')
  const [severity, setSeverity] = useState<AnnotationSeverity | ''>('')
  const [dimensions, setDimensions] = useState('')
  const [comment, setComment] = useState('')
  const [proposedText, setProposedText] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)

  const isEditMode = editingAnnotation !== null

  // Pre-fill when editing an existing annotation
  useEffect(() => {
    if (editingAnnotation) {
      setAction(editingAnnotation.action)
      setSeverity(editingAnnotation.severity || '')
      setDimensions(editingAnnotation.dimensions?.join(', ') || '')
      setComment(editingAnnotation.comment)
      setProposedText(editingAnnotation.proposedText || '')
    }
  }, [editingAnnotation])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleClose = () => {
    setEditingAnnotation(null)
    setAction('rewrite')
    setSeverity('')
    setDimensions('')
    setComment('')
    setProposedText('')
    onClose()
  }

  // Determine what to show — either editing an existing annotation or creating from selection
  const displayText = isEditMode ? editingAnnotation.selectedText : selection?.text || ''

  const effectivePosition = isEditMode
    ? (() => {
        const view = viewRef?.current
        if (!view || !editingAnnotation) return { x: window.innerWidth / 2 - 170, y: 200 }
        const coords = view.coordsAtPos(editingAnnotation.to)
        return coords ? { x: coords.left, y: coords.bottom } : { x: window.innerWidth / 2 - 170, y: 200 }
      })()
    : position

  if (!isEditMode && (!selection || !position)) return null
  if (!effectivePosition) return null

  const handleSave = () => {
    const view = viewRef?.current
    if (!view) return

    const parsedDimensions = dimensions
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)

    if (isEditMode && editingAnnotation) {
      // Update existing annotation
      view.dispatch({
        effects: updateAnnotation.of({
          id: editingAnnotation.id,
          changes: {
            action,
            severity: severity || undefined,
            dimensions: parsedDimensions.length > 0 ? parsedDimensions : undefined,
            comment,
            proposedText: proposedText || undefined,
          },
        }),
      })
    } else if (selection) {
      // Create new annotation
      view.dispatch({
        effects: addAnnotation.of({
          id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          from: selection.from,
          to: selection.to,
          selectedText: selection.text,
          action,
          severity: severity || undefined,
          dimensions: parsedDimensions.length > 0 ? parsedDimensions : undefined,
          comment,
          proposedText: proposedText || undefined,
          createdAt: new Date().toISOString(),
        }),
      })
    }

    handleClose()
  }

  const truncatedText = displayText.length > 100 ? displayText.slice(0, 100) + '...' : displayText

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '11px',
    fontFamily: "'Inter', sans-serif",
    padding: '8px 12px',
    borderRadius: 'var(--card-radius)',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  }

  const actionBtnStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 8px',
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    background: isActive ? 'var(--accent-blue)' : 'var(--bg-hover)',
    color: isActive ? 'var(--accent-blue-text)' : 'var(--text-muted)',
    border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-color)'}`,
  })

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        zIndex: 50,
        width: '360px',
        left: Math.min(effectivePosition.x, window.innerWidth - 380),
        top: Math.min(effectivePosition.y + 10, window.innerHeight - 500),
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--card-radius)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <div
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: '6px',
          }}
        >
          {isEditMode ? 'Edit annotation' : 'Selected text'}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-primary)',
            fontFamily: "'Courier Prime', monospace",
            lineHeight: '1.5',
          }}
        >
          &ldquo;{truncatedText}&rdquo;
        </div>
      </div>

      {/* AI Rewrite + Action selector */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        {onAIRewrite && !isEditMode && (
          <button
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 12px',
              marginBottom: '14px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              borderRadius: 'var(--card-radius)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: 'var(--accent-blue)',
              color: 'var(--accent-blue-text)',
              border: '1px solid var(--accent-blue)',
            }}
            onClick={() => {
              onAIRewrite()
              handleClose()
            }}
            type="button"
          >
            <MessageSquarePlus size={14} />
            Rewrite with AI
          </button>
        )}

        <div
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          {isEditMode ? 'Action' : 'Or annotate'}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['rewrite', 'delete', 'move', 'flag'] as AnnotationAction[]).map((a) => (
            <button
              key={a}
              style={actionBtnStyle(action === a)}
              onClick={() => setAction(a)}
              type="button"
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Severity selector */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <div
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          Severity (optional)
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['', 'P1', 'P2', 'P3'] as const).map((s) => (
            <button
              key={s || 'none'}
              style={actionBtnStyle(severity === s)}
              onClick={() => setSeverity(s)}
              type="button"
            >
              {s || 'None'}
            </button>
          ))}
        </div>
      </div>

      {/* Dimensions + Comment + Proposed */}
      <div style={{ padding: '14px 16px' }}>
        {action !== 'delete' && (
          <textarea
            style={{ ...inputStyle, marginBottom: '8px', resize: 'none' }}
            rows={2}
            placeholder={
              action === 'move'
                ? 'Move where?'
                : action === 'flag'
                  ? 'What do you want to flag?'
                  : 'What should change?'
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        )}

        {action === 'rewrite' && (
          <textarea
            style={{ ...inputStyle, marginBottom: '8px', resize: 'none', fontFamily: "'Courier Prime', monospace" }}
            rows={2}
            placeholder="Proposed replacement text (optional)"
            value={proposedText}
            onChange={(e) => setProposedText(e.target.value)}
          />
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              borderRadius: 'var(--card-radius)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: 'var(--accent-cyan)',
              color: '#0a0a0f',
              border: 'none',
            }}
            onClick={handleSave}
            type="button"
          >
            {isEditMode ? 'Update Annotation' : 'Save Annotation'}
          </button>
          <button
            style={{
              padding: '8px 12px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              borderRadius: 'var(--card-radius)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
