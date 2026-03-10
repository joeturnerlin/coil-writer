import { useEditorStore } from '../store/editor-store'

export function StatsBar() {
  const { fileName, cursorLine, stats } = useEditorStore()

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
        {stats && <span>~{stats.estimatedPages} pages</span>}
      </div>
    </div>
  )
}
