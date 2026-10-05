import { EditorView } from '@codemirror/view'
/**
 * ProofreadPanel — right-column panel for the AI proofreader.
 * Every finding shown here has been machine-verified against the document text (see proofread-verify.ts).
 */
import { Loader2, SpellCheck, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { estimateProofreadCost } from '../lib/proofread'
import type { ProofreadCategory, ProofreadFinding } from '../lib/proofread-types'
import { totalDropped } from '../lib/proofread-types'
import { applyTarget, isStale } from '../lib/proofread-verify'
import { formatTokens, formatUSD } from '../lib/usage'
import { snapshotBeforeAI } from '../lib/version-history'
import { useEditorStore } from '../store/editor-store'
import { useProofreadStore } from '../store/proofread-store'
import { useSettingsStore } from '../store/settings-store'

const GROUPS: { category: ProofreadCategory; label: string }[] = [
  { category: 'spelling', label: 'Spelling' },
  { category: 'wrong-name', label: 'Wrong name' },
  { category: 'day-night', label: 'Day / night' },
  { category: 'continuity-objective', label: 'Continuity' },
  { category: 'name-variant', label: 'Similar character names' },
  { category: 'slugline', label: 'Scene headings' },
  { category: 'time-cue', label: 'Time cues in action' },
  { category: 'continuous-after-jump', label: 'CONTINUOUS after a time change' },
]

const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: '6px 14px',
  fontSize: '18px',
  fontFamily: 'inherit',
  fontWeight: 600,
  borderRadius: 'var(--btn-radius)',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  background: primary ? 'var(--accent-cyan-dim)' : 'var(--bg-hover)',
  border: `1px solid ${primary ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
  color: primary ? 'var(--accent-cyan)' : 'var(--text-primary)',
})

function view(): EditorView | null {
  return useEditorStore.getState().viewRef?.current ?? null
}

function jump(line: number, quote: string) {
  const v = view()
  if (!v || line < 1 || line > v.state.doc.lines) return
  const l = v.state.doc.line(line)
  const at = l.text.indexOf(quote)
  const from = at >= 0 ? l.from + at : l.from
  const to = at >= 0 ? from + quote.length : l.to
  v.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center', yMargin: 50 }),
  })
  v.focus()
}

async function applyFix(f: ProofreadFinding): Promise<string | null> {
  const v = view()
  if (!v) return 'Editor not ready.'
  const target = applyTarget(f, v.state.doc.toString().split('\n'))
  if (!target) return 'That line changed; re-check.'
  try {
    await snapshotBeforeAI('Proofread fix')
  } catch {
    return 'Could not save a version snapshot, so nothing was changed.'
  }
  // Re-resolve after the await: the document may have moved while the snapshot was written.
  const again = applyTarget(f, v.state.doc.toString().split('\n'))
  if (!again) return 'That line changed; re-check.'
  const from = v.state.doc.line(again.line).from + again.start
  v.dispatch({
    changes: { from, to: from + (again.end - again.start), insert: again.replacement },
    selection: { anchor: from, head: from + again.replacement.length },
  })
  return null
}

export function ProofreadPanel() {
  const toggleProofread = useSettingsStore((s) => s.toggleProofread)
  const content = useEditorStore((s) => s.content)
  const documentId = useEditorStore((s) => s.documentId)
  const { status, progress, error, result, resultDocId, dismissed, run, cancel, dismiss } = useProofreadStore()
  const [applyError, setApplyError] = useState<string | null>(null)
  const deferred = useDeferredValue(content)

  const estimate = useMemo(() => (deferred?.trim() ? estimateProofreadCost(deferred) : null), [deferred])
  const lines = useMemo(() => (content ?? '').split('\n'), [content])

  const mine = result && resultDocId === documentId ? result : null
  const hidden = new Set(documentId ? (dismissed[documentId] ?? []) : [])
  const shown = mine ? mine.findings.filter((f) => !hidden.has(f.id)) : []
  const real = shown.filter((f) => f.severity === 'warning')
  const running = status === 'running'

  return (
    <div
      style={{
        width: 'var(--panel-annotation-width)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        minHeight: 0,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '18px',
        color: 'var(--text-primary)',
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
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
          <SpellCheck size={18} /> Proofread
        </span>
        <button
          type="button"
          aria-label="Close proofread"
          onClick={toggleProofread}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
        >
          <X size={18} />
        </button>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {running ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={18} className="animate-spin" />
              {progress.total
                ? `Checking chunk ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                : 'Starting'}
            </div>
            <button type="button" style={btn()} onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" style={btn(true, !estimate)} disabled={!estimate} onClick={() => void run()}>
              {mine ? 'Run again' : 'Run proofread'}
            </button>
            {estimate && (
              <div style={{ color: 'var(--text-muted)' }}>
                {estimate.chunks} chunk{estimate.chunks === 1 ? '' : 's'}, about {formatTokens(estimate.inputTokens)}{' '}
                tokens in
                {estimate.usd !== null ? `, est. ${formatUSD(estimate.usd)}` : ', cost unknown for this model'}
              </div>
            )}
          </>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {error && !running && (
          <div role="alert" style={{ color: 'var(--structure-gap, #ef5350)' }}>
            The check failed: {error}
            <button type="button" style={{ ...btn(), display: 'block', marginTop: '8px' }} onClick={() => void run()}>
              Retry
            </button>
          </div>
        )}
        {mine && mine.failedChunks > 0 && (
          <div role="alert" style={{ color: 'var(--structure-gap, #ef5350)' }}>
            Incomplete: {mine.failedChunks} of {mine.chunks} chunks failed
            {mine.firstError ? ` (${mine.firstError})` : ''}. Findings below cover only the chunks that worked.
          </div>
        )}
        {applyError && (
          <div role="alert" style={{ color: 'var(--structure-gap, #ef5350)' }}>
            {applyError}
          </div>
        )}

        {mine && real.length === 0 && shown.length === 0 && mine.failedChunks === 0 && (
          <div>No problems found in {mine.scenes} scenes.</div>
        )}

        {mine &&
          GROUPS.map(({ category, label }) => {
            const items = shown.filter((f) => f.category === category)
            if (!items.length) return null
            return (
              <section key={category} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 700 }}>
                  {label} ({items.length})
                </div>
                {items.map((f) => {
                  const stale = isStale(f, lines)
                  const target = stale ? null : applyTarget(f, lines)
                  return (
                    <div
                      key={f.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--btn-radius)',
                        background: 'var(--bg-primary)',
                        opacity: stale ? 0.5 : 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div>{f.claim}</div>
                      {f.suggestion && (
                        <div style={{ color: 'var(--text-muted)' }}>
                          Suggestion: <strong>{f.suggestion}</strong>
                        </div>
                      )}
                      {f.evidence.map((e) => (
                        <button
                          key={`${e.line}:${e.quote}`}
                          type="button"
                          disabled={stale}
                          onClick={() => jump(e.line, e.quote)}
                          style={{
                            textAlign: 'left',
                            background: 'var(--bg-hover)',
                            border: 'none',
                            borderRadius: 'var(--btn-radius)',
                            padding: '4px 8px',
                            color: 'inherit',
                            fontFamily: 'inherit',
                            fontSize: '18px',
                            cursor: stale ? 'default' : 'pointer',
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>Line {e.line}:</span> “{e.quote}”
                        </button>
                      ))}
                      {stale && <div style={{ color: 'var(--text-muted)' }}>Text changed. Re-check.</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {target && (
                          <button type="button" style={btn(true)} onClick={() => void applyFix(f).then(setApplyError)}>
                            Apply
                          </button>
                        )}
                        <button type="button" style={btn()} onClick={() => documentId && dismiss(documentId, f.id)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )
                })}
              </section>
            )
          })}
      </div>

      {mine && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
          {real.length} finding{real.length === 1 ? '' : 's'} · {totalDropped(mine.dropped)} unverified suggestion
          {totalDropped(mine.dropped) === 1 ? '' : 's'} discarded
        </div>
      )}
    </div>
  )
}
