import { computeTiming } from '../lib/page-timing'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSubscriptionStore } from '../store/subscription-store'
import { UsageReadout } from './UsageReadout'

export function StatsBar() {
  const { fileName, cursorLine, stats } = useEditorStore()
  const { tier, byok, remainingUses } = useSubscriptionStore()
  const scenes = useScriptStore((s) => s.scenes)
  const timing = computeTiming(scenes)

  const showUsage = tier === 'free' && !byok
  const remaining = remainingUses('rewrite')

  return (
    <footer
      className="flex items-center justify-between px-4 py-1"
      style={{
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        color: 'var(--text-dim)',
        fontSize: '10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 500,
      }}
    >
      <div
        className="flex items-center gap-4"
        style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden', whiteSpace: 'nowrap' }}
      >
        {fileName && <span style={{ flexShrink: 0 }}>{fileName}</span>}
        <span style={{ flexShrink: 0 }}>
          <SaveStatus />
        </span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <UsageReadout />
        </span>
      </div>
      <div className="flex items-center gap-4" style={{ flexShrink: 0, whiteSpace: 'nowrap', marginLeft: '16px' }}>
        {cursorLine > 0 && <span>Line {cursorLine}</span>}
        {stats && (
          <span>
            ~{stats.estimatedPages} pages | ~{timing.totalFormatted}
          </span>
        )}
        {showUsage && (
          <span
            style={{
              color: remaining <= 2 ? 'var(--structure-gap)' : 'var(--text-dim)',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {remaining} rewrites left
          </span>
        )}
      </div>
    </footer>
  )
}

/** Autosave state: 'Saved' only after IndexedDB has committed the write. */
function SaveStatus() {
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const saveError = useEditorStore((s) => s.saveError)
  if (saveStatus === 'failed') {
    return (
      <span style={{ color: '#ef5350' }} title={saveError ?? undefined}>
        Autosave failed, retrying
      </span>
    )
  }
  if (saveStatus === 'saving') return <span>Saving…</span>
  if (!lastSavedAt) return null
  const time = new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return <span title={`Saved on this device at ${time}`}>Saved {time}</span>
}
