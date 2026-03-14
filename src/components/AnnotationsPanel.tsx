import { History, Sparkles, Trash2, X } from 'lucide-react'
import { useAIStore } from '../store/ai-store'
import { useRevisionStore, REVISION_COLORS } from '../store/revision-store'
import { useSettingsStore } from '../store/settings-store'
import { useAnalysis } from './AnalysisPanel'
import { RevisionCard } from './RevisionCard'

export function AnnotationsPanel() {
  const { toggleAnnotations } = useSettingsStore()
  const { currentProfile, analysisState } = useAIStore()
  const { revisions, revisionMode, toggleRevisionMode, startNewPass, clearRevisions, currentPass } =
    useRevisionStore()
  const triggerAnalysis = useAnalysis()
  const isAnalyzing = analysisState.status === 'analyzing' || analysisState.status === 'sending'

  const passInfo = REVISION_COLORS.find((c) => c.pass === currentPass)
  const passColor = passInfo?.color ?? '#4fc3f7'
  const passName = passInfo?.name ?? `Pass ${currentPass}`

  // Sort revisions by document position
  const sorted = [...revisions].sort((a, b) => a.from - b.from)

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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
          }}
        >
          Revisions ({revisions.length})
        </span>
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
          onClick={toggleAnnotations}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {/* Revision mode controls */}
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {/* Revision mode toggle */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '6px 10px',
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            borderRadius: 'var(--btn-radius)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: revisionMode ? 'rgba(79, 195, 247, 0.15)' : 'var(--bg-primary)',
            border: revisionMode ? '1px solid #4fc3f7' : '1px solid var(--border-color)',
            color: revisionMode ? '#4fc3f7' : 'var(--text-muted)',
          }}
          onClick={toggleRevisionMode}
          type="button"
          title={revisionMode ? 'Stop tracking manual edits' : 'Start tracking manual edits'}
        >
          <History size={12} />
          {revisionMode ? 'Tracking Edits' : 'Track Edits'}
        </button>

        {/* Pass info + controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--text-muted)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: passColor,
                display: 'inline-block',
              }}
            />
            Rev. {passName}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              style={{
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 500,
                borderRadius: '3px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-dim)',
              }}
              onClick={startNewPass}
              type="button"
              title="Start new revision pass"
            >
              New Pass
            </button>
            {revisions.length > 0 && (
              <button
                style={{
                  padding: '2px 4px',
                  fontSize: '9px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={clearRevisions}
                type="button"
                title="Clear all revisions"
              >
                <Trash2 size={9} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Revision list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((rev) => (
          <RevisionCard key={rev.id} revision={rev} />
        ))}
        {sorted.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: '1.6',
            }}
          >
            {revisionMode
              ? 'Edits will appear here as you type'
              : 'AI rewrites logged automatically. Toggle "Track Edits" for manual changes.'}
          </div>
        )}
      </div>

      {/* Analyze button */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '8px 12px',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            borderRadius: 'var(--btn-radius)',
            cursor: isAnalyzing ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
            background: currentProfile ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
            border: '1px solid #ff9800',
            color: '#ff9800',
            opacity: isAnalyzing ? 0.5 : 1,
          }}
          onClick={triggerAnalysis}
          disabled={isAnalyzing}
          type="button"
          title={currentProfile ? 'Re-analyze script voice profile' : 'Analyze script to match your writing voice'}
        >
          <Sparkles size={14} />
          {currentProfile ? 'Re-analyze Voice' : 'Analyze Voice'}
        </button>
        {currentProfile && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Voice profile active
          </div>
        )}
      </div>
    </div>
  )
}
