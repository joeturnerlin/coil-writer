import { X } from 'lucide-react'
import { useState } from 'react'
import { attachNoteToSelection, deleteUnplacedNote, getView } from '../lib/notes'
import { useAnnotationStore } from '../store/annotation-store'
import { useSettingsStore } from '../store/settings-store'
import { NoteCard, noteTime } from './NoteCard'

const mono = "'JetBrains Mono', monospace"

const headerLabel: React.CSSProperties = {
  fontSize: '10px',
  fontFamily: mono,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: 'var(--text-muted)',
}

const smallButton: React.CSSProperties = {
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

/** Right-column inspector: the same notes the margin shows, in script order, plus imports waiting to be placed. */
export function NotesPanel() {
  const toggleNotes = useSettingsStore((s) => s.toggleNotes)
  const annotations = useAnnotationStore((s) => s.annotations)
  const needsPlacing = useAnnotationStore((s) => s.needsPlacing)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const notice = useAnnotationStore((s) => s.notice)
  const setSelectedId = useAnnotationStore((s) => s.setSelectedId)
  const [hintId, setHintId] = useState<string | null>(null)
  const sorted = [...annotations].sort((a, b) => a.from - b.from || a.to - b.to)

  return (
    <div
      style={{
        width: 'var(--panel-annotation-width)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span style={headerLabel}>Notes ({annotations.length})</span>
        <button
          style={{
            padding: '4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 'var(--btn-radius)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={toggleNotes}
          type="button"
          aria-label="Close notes"
        >
          <X size={14} />
        </button>
      </div>

      {notice && (
        <div
          style={{
            padding: '8px 16px',
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>{notice}</span>
          <button
            type="button"
            style={{ ...smallButton, border: 'none' }}
            onClick={() => useAnnotationStore.getState().setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '12px' }}>
        {sorted.map((n) => (
          <div key={n.id} style={{ margin: '0 var(--card-margin-x) var(--card-margin-b)' }}>
            <NoteCard note={n} focused={selectedId === n.id} onFocus={() => setSelectedId(n.id)} />
          </div>
        ))}
        {sorted.length === 0 && needsPlacing.length === 0 && (
          <div
            style={{
              padding: '12px 16px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: mono,
              lineHeight: '1.6',
            }}
          >
            Select text in the script, then press Cmd/Ctrl+Shift+M or click Note.
          </div>
        )}

        {needsPlacing.length > 0 && (
          <>
            <div style={{ ...headerLabel, padding: '12px 16px 4px', color: 'var(--mode-analyze-text)' }}>
              Needs placing ({needsPlacing.length})
            </div>
            <div
              style={{
                padding: '0 16px 8px',
                fontSize: '11px',
                fontFamily: "'Inter', sans-serif",
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              These passages changed or appear more than once. Select the right text in the script, then Attach here.
            </div>
            {needsPlacing.map((n) => (
              <div
                key={n.id}
                style={{
                  margin: '0 var(--card-margin-x) var(--card-margin-b)',
                  padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px dashed var(--mode-analyze-text)',
                  borderRadius: 'var(--card-radius)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    fontFamily: mono,
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{n.author || 'Me'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{noteTime(n.createdAt)}</span>
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: "'Inter', sans-serif",
                    color: 'var(--text-dim)',
                    marginBottom: '4px',
                    maxHeight: '3.2em',
                    overflow: 'hidden',
                  }}
                >
                  “{n.selectedText.replace(/\s+/g, ' ')}”
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontFamily: "'Inter', sans-serif",
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {n.comment}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    style={smallButton}
                    onClick={() => {
                      const view = getView()
                      setHintId(view && attachNoteToSelection(view, n.id) ? null : n.id)
                    }}
                  >
                    Attach here
                  </button>
                  <button type="button" style={smallButton} onClick={() => deleteUnplacedNote(n.id)}>
                    Discard
                  </button>
                </div>
                {hintId === n.id && (
                  <div
                    style={{ marginTop: '6px', fontSize: '10px', fontFamily: mono, color: 'var(--mode-analyze-text)' }}
                  >
                    Select the passage in the script first.
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
