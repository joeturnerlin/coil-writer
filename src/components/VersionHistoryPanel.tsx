import { History, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type DiffLine, diffLines, lineDelta, listVersions, restoreVersion, saveVersion } from '../lib/version-history'
import type { VersionRecord } from '../lib/version-history'
import { useEditorStore } from '../store/editor-store'

interface VersionHistoryPanelProps {
  open: boolean
  onClose: () => void
}

const KIND_LABEL: Record<VersionRecord['kind'], string> = {
  auto: 'Auto',
  manual: 'Saved',
  ai: 'Before AI edit',
  open: 'Before opening a file',
  'pre-restore': 'Before restore',
  restore: 'Restore',
}

const mono = "'JetBrains Mono', monospace"

function formatSize(chars: number): string {
  return chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`
}

/** Changed lines with 2 lines of context; unchanged runs collapse to a gap marker. */
function hunks(lines: DiffLine[]): (DiffLine | null)[] {
  const keep = lines.map((l) => l.type !== 'same')
  const near = keep.map((_, i) => keep.slice(Math.max(0, i - 2), i + 3).some(Boolean))
  const out: (DiffLine | null)[] = []
  let gap = false
  lines.forEach((l, i) => {
    if (near[i]) {
      out.push(l)
      gap = false
    } else if (!gap) {
      out.push(null)
      gap = true
    }
  })
  return out
}

export function VersionHistoryPanel({ open, onClose }: VersionHistoryPanelProps) {
  const documentId = useEditorStore((s) => s.documentId)
  const content = useEditorStore((s) => s.content)
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const saveError = useEditorStore((s) => s.saveError)
  const [versions, setVersions] = useState<VersionRecord[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!documentId) return setVersions([])
    setVersions(await listVersions(documentId))
  }, [documentId])

  useEffect(() => {
    if (!open) return
    refresh().catch((e) => setError(String(e)))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, refresh])

  const selected = versions.find((v) => v.id === selectedId) ?? null
  const preview = useMemo(
    () => (selected && content !== null ? hunks(diffLines(content, selected.content)) : []),
    [selected, content],
  )

  if (!open) return null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const buttonStyle: React.CSSProperties = {
    fontSize: '11px',
    fontFamily: mono,
    padding: '5px 10px',
    borderRadius: 'var(--card-radius)',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  }

  const statusText =
    saveStatus === 'failed'
      ? `Save failed${saveError ? `: ${saveError}` : ''}`
      : saveStatus === 'saving'
        ? 'Saving…'
        : lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'Saved'

  return (
    // biome-ignore lint/a11y/useSemanticElements: matches the app's other overlay dialogs
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse convenience; Escape is handled by the window listener above
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          width: 'min(880px, 94vw)',
          height: 'min(600px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary, var(--bg-primary))',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--card-radius)',
          color: 'var(--text-primary)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <History size={14} />
          <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: mono }}>Version history</span>
          <span
            data-testid="save-status"
            style={{
              fontSize: '10px',
              fontFamily: mono,
              color: saveStatus === 'failed' ? '#e5484d' : 'var(--text-muted)',
            }}
          >
            {statusText}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonStyle, marginLeft: 'auto' }}>
            <X size={12} />
          </button>
        </div>

        <div
          style={{ display: 'flex', gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            aria-label="Version label"
            style={{
              flex: 1,
              fontSize: '12px',
              fontFamily: mono,
              padding: '5px 10px',
              borderRadius: 'var(--card-radius)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            disabled={busy || !documentId}
            style={buttonStyle}
            onClick={() =>
              run(async () => {
                await saveVersion(label)
                setLabel('')
              })
            }
          >
            Save version
          </button>
        </div>

        {error && (
          <div role="alert" style={{ padding: '6px 16px', fontSize: '11px', fontFamily: mono, color: '#e5484d' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: '300px', overflowY: 'auto', borderRight: '1px solid var(--border-color)' }}>
            {versions.length === 0 && (
              <div style={{ padding: '16px', fontSize: '11px', fontFamily: mono, color: 'var(--text-muted)' }}>
                No versions yet. They are saved automatically while you write.
              </div>
            )}
            {versions.map((v, i) => {
              const older = versions[i + 1]
              const delta = older ? lineDelta(older.content, v.content) : null
              return (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setSelectedId(v.id ?? null)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 16px',
                    background: v.id === selectedId ? 'var(--bg-hover)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '11px', fontFamily: mono }}>{new Date(v.createdAt).toLocaleString()}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    {v.label ? `${v.label}` : KIND_LABEL[v.kind]}
                  </div>
                  <div style={{ fontSize: '10px', fontFamily: mono, color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatSize(v.content.length)}
                    {delta && (
                      <>
                        {' · '}
                        <span style={{ color: '#3fb950' }}>+{delta.added}</span>{' '}
                        <span style={{ color: '#e5484d' }}>-{delta.removed}</span>
                      </>
                    )}
                    {v.label ? ` · ${KIND_LABEL[v.kind]}` : ''}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {selected ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ fontSize: '10px', fontFamily: mono, color: 'var(--text-muted)' }}>
                    Restoring would add the green lines and remove the red ones
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...buttonStyle, marginLeft: 'auto' }}
                    onClick={() => selected.id !== undefined && run(() => restoreVersion(selected.id as number))}
                  >
                    Restore this version
                  </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                  {preview.length === 0 || preview.every((l) => l?.type === 'same' || l === null) ? (
                    <div
                      style={{ padding: '8px 16px', fontSize: '11px', fontFamily: mono, color: 'var(--text-muted)' }}
                    >
                      Identical to the current text.
                    </div>
                  ) : (
                    preview.map((l, i) =>
                      l === null ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static, order-stable list
                        <div key={i} style={{ padding: '0 16px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          …
                        </div>
                      ) : (
                        <div
                          // biome-ignore lint/suspicious/noArrayIndexKey: static, order-stable list
                          key={i}
                          style={{
                            padding: '0 16px',
                            fontSize: '11px',
                            fontFamily: mono,
                            whiteSpace: 'pre-wrap',
                            minHeight: '1.4em',
                            background:
                              l.type === 'add'
                                ? 'rgba(63,185,80,0.15)'
                                : l.type === 'remove'
                                  ? 'rgba(229,72,77,0.15)'
                                  : 'transparent',
                            color: l.type === 'same' ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        >
                          {l.type === 'add' ? '+ ' : l.type === 'remove' ? '- ' : '  '}
                          {l.text}
                        </div>
                      ),
                    )
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '16px', fontSize: '11px', fontFamily: mono, color: 'var(--text-muted)' }}>
                Select a version to preview it against the current text.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Toolbar-ready button that owns the panel's open state. Mount it anywhere in the UI. */
export function VersionHistoryButton() {
  const [open, setOpen] = useState(false)
  const hasDocument = useEditorStore((s) => s.documentId !== null)
  return (
    <>
      <button
        type="button"
        title="Version history"
        aria-label="Version history"
        disabled={!hasDocument}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 6px',
          fontSize: '11px',
          fontWeight: 500,
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '5px',
          color: 'var(--text-secondary)',
          cursor: hasDocument ? 'pointer' : 'default',
          opacity: hasDocument ? 1 : 0.5,
        }}
      >
        <History size={13} />
        History
      </button>
      <VersionHistoryPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
