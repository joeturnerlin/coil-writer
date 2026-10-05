import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Annotation } from '../editor/types'
import { deleteNote, editNote, getView, jumpToNote } from '../lib/notes'

const mono = "'JetBrains Mono', monospace"

export function noteTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const linkButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 6px',
  fontSize: '9px',
  fontFamily: mono,
  fontWeight: 500,
  borderRadius: '3px',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid var(--border-color)',
  color: 'var(--text-dim)',
}

interface NoteCardProps {
  note: Annotation
  focused: boolean
  /** Margin version: comment clamps to three lines and the quote/actions show only when focused. */
  compact?: boolean
  onFocus?: () => void
}

/** One note, used by both the margin column and the Notes panel (same store, same actions). */
export function NoteCard({ note, focused, compact = false, onFocus }: NoteCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.comment)
  const [confirming, setConfirming] = useState(false)
  const showActions = !compact || focused
  const quote = note.selectedText.replace(/\s+/g, ' ')

  const focus = () => {
    const view = getView()
    if (view) jumpToNote(view, note)
    onFocus?.()
  }

  const saveEdit = () => {
    const view = getView()
    if (view && draft.trim()) editNote(view, note.id, draft)
    setEditing(false)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: card click is a pointer convenience; its buttons are the keyboard path
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, textarea')) return
        focus()
      }}
      style={{
        padding: '10px 12px',
        background: 'var(--bg-tertiary)',
        border: `1px solid ${focused ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
        borderRadius: 'var(--card-radius)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          fontSize: '10px',
          fontFamily: mono,
          marginBottom: '4px',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{note.author || 'Me'}</span>
        <span style={{ fontWeight: 500, color: 'var(--text-dim)' }}>{noteTime(note.createdAt)}</span>
      </div>
      {(!compact || focused) && (
        <div
          style={{
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-dim)',
            marginBottom: '4px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          “{quote}”
        </div>
      )}
      {editing ? (
        <textarea
          // biome-ignore lint/a11y/noAutofocus: inline edit opens to be typed into
          autoFocus
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              setDraft(note.comment)
              setEditing(false)
            } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              saveEdit()
            }
          }}
          style={{
            width: '100%',
            resize: 'none',
            boxSizing: 'border-box',
            fontSize: '12px',
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.5,
            padding: '6px 8px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--btn-radius)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      ) : (
        <div
          style={{
            fontSize: '12px',
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...(compact && !focused
              ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
              : {}),
          }}
        >
          {note.comment}
        </div>
      )}
      {showActions && !editing && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {confirming ? (
            <>
              <span style={{ fontSize: '10px', fontFamily: mono, color: 'var(--text-muted)' }}>Delete?</span>
              <button
                type="button"
                style={{
                  ...linkButton,
                  color: 'var(--continuity-warning, #ef5350)',
                  borderColor: 'var(--continuity-warning, #ef5350)',
                }}
                onClick={() => {
                  const view = getView()
                  if (view) deleteNote(view, note.id)
                }}
              >
                Yes, delete
              </button>
              <button type="button" style={linkButton} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                style={linkButton}
                onClick={() => {
                  setDraft(note.comment)
                  setEditing(true)
                }}
              >
                <Pencil size={9} /> Edit
              </button>
              <button type="button" style={linkButton} onClick={() => setConfirming(true)}>
                <Trash2 size={9} /> Delete
              </button>
            </>
          )}
        </div>
      )}
      {editing && (
        <div style={{ marginTop: '6px', fontSize: '9px', fontFamily: mono, color: 'var(--text-dim)' }}>
          Enter saves · Shift+Enter newline · Esc cancels
        </div>
      )}
    </div>
  )
}
