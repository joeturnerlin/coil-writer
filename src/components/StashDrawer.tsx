import { Search, Trash2, X } from 'lucide-react'
import { type StashEntry, useStashStore } from '../store/stash-store'
import { useSubscriptionStore } from '../store/subscription-store'

export function StashDrawer() {
  const { entries, isOpen, searchQuery, toggleOpen, removeEntry, setSearchQuery, clear } = useStashStore()
  const canUseStashAI = useSubscriptionStore((s) => s.canUse('stash-ai'))

  if (entries.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* Handle tab — always visible when entries exist */}
      <button
        onClick={toggleOpen}
        type="button"
        style={{
          position: 'absolute',
          bottom: isOpen ? undefined : 0,
          top: isOpen ? 0 : undefined,
          left: '50%',
          transform: isOpen ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          background: 'var(--stash-tab-bg)',
          border: '1px solid var(--stash-tab-border)',
          borderBottom: 'none',
          borderRadius: '4px 4px 0 0',
          color: 'var(--stash-handle-color)',
          cursor: 'pointer',
          padding: '4px 12px',
          zIndex: 10,
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        Stash ({entries.length})
      </button>

      {/* Expanded drawer */}
      {isOpen && (
        <div
          style={{
            height: '240px',
            background: 'var(--bg-secondary, var(--bg-primary))',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter stash..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
              }}
            />
            <button
              type="button"
              disabled={!canUseStashAI}
              title={canUseStashAI ? 'AI-powered stash search' : 'Upgrade for AI-powered stash search'}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                background: canUseStashAI ? 'var(--accent-cyan-dim)' : 'transparent',
                border: `1px solid ${canUseStashAI ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                borderRadius: '4px',
                color: canUseStashAI ? 'var(--accent-cyan)' : 'var(--text-dim)',
                cursor: canUseStashAI ? 'pointer' : 'default',
                opacity: canUseStashAI ? 1 : 0.5,
                flexShrink: 0,
              }}
            >
              Find in Stash
            </button>
            <button
              type="button"
              onClick={clear}
              title="Clear all stash entries"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '3px 6px',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Card list — horizontal scroll */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              padding: '8px 12px',
              overflowX: 'auto',
              overflowY: 'hidden',
              flex: 1,
              alignItems: 'flex-start',
            }}
          >
            {entries
              .filter(
                (e) =>
                  !searchQuery ||
                  e.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  e.sceneHeading.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((entry) => (
                <StashCard key={entry.id} entry={entry} onRemove={() => removeEntry(entry.id)} />
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StashCard({ entry, onRemove }: { entry: StashEntry; onRemove: () => void }) {
  const timeAgo = formatTimeAgo(entry.timestamp)

  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--card-radius)',
        minWidth: '200px',
        maxWidth: '280px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Header: scene heading + remove button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--accent-cyan)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {entry.sceneHeading || 'No scene'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '0 0 0 4px',
            flexShrink: 0,
            display: 'flex',
          }}
        >
          <X size={10} />
        </button>
      </div>

      {/* Text preview — 2 lines max */}
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {entry.text}
      </div>

      {/* Footer: timestamp + source badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
        <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>{timeAgo}</span>
        <span
          style={{
            fontSize: '8px',
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: '3px',
            background: entry.source === 'cut' ? 'var(--accent-cyan-dim)' : 'var(--bg-hover)',
            color: entry.source === 'cut' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {entry.source}
        </span>
      </div>
    </div>
  )
}

function formatTimeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}
