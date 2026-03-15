import { computeTiming } from '../lib/page-timing'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSubscriptionStore } from '../store/subscription-store'

export function StatsBar() {
  const { fileName, cursorLine, stats } = useEditorStore()
  const { tier, byok, remainingUses } = useSubscriptionStore()
  const scenes = useScriptStore((s) => s.scenes)
  const timing = computeTiming(scenes)

  const showUsage = tier === 'free' && !byok
  const remaining = remainingUses('rewrite')

  return (
    <div
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
      <div className="flex items-center gap-4">{fileName && <span>{fileName}</span>}</div>
      <div className="flex items-center gap-4">
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
    </div>
  )
}
