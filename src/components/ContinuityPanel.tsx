import { AlertTriangle, CheckCircle, X } from 'lucide-react'
import type { ContinuityIssue, ContinuityResult } from '../lib/continuity-check'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'

interface ContinuityPanelProps {
  result: ContinuityResult
  onClose: () => void
}

const TYPE_BADGES: Record<ContinuityIssue['type'], { label: string; color: string; bg: string }> = {
  character: { label: 'Character', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  prop: { label: 'Prop', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
  timeline: { label: 'Timeline', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  location: { label: 'Location', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' },
  logic: { label: 'Logic', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)' },
}

const SEVERITY_STYLES: Record<ContinuityIssue['severity'], { color: string; bg: string }> = {
  error: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  warning: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
}

export function ContinuityPanel({ result, onClose }: ContinuityPanelProps) {
  const scenes = useScriptStore.getState().scenes

  const scrollToScene = (sceneIndex: number) => {
    const scene = scenes.find((s) => s.index === sceneIndex)
    if (!scene) return
    const view = useEditorStore.getState().viewRef?.current
    if (!view) return
    view.dispatch({
      selection: { anchor: scene.from },
      scrollIntoView: true,
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-primary)',
            }}
          >
            Script Continuity Check
          </span>
          <button
            onClick={onClose}
            type="button"
            title="Close"
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
          >
            <X size={16} />
          </button>
        </div>

        {/* Summary */}
        <div
          style={{
            padding: '10px 20px',
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          {result.summary}
        </div>

        {/* Issue list or empty state */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px',
          }}
        >
          {result.issues.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '40px 20px',
                color: '#4ade80',
              }}
            >
              <CheckCircle size={32} />
              <span
                style={{
                  fontSize: '13px',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}
              >
                No continuity issues found
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.issues.map((issue, i) => {
                const typeBadge = TYPE_BADGES[issue.type]
                const severityStyle = SEVERITY_STYLES[issue.severity]
                const scene = scenes.find((s) => s.index === issue.sceneIndex)
                const sceneLabel = scene?.heading
                  ? `Scene ${issue.sceneIndex}: ${scene.heading}`
                  : `Scene ${issue.sceneIndex}`

                return (
                  <div
                    key={i}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    {/* Badges row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      {/* Type badge */}
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          color: typeBadge.color,
                          background: typeBadge.bg,
                        }}
                      >
                        {typeBadge.label}
                      </span>

                      {/* Severity badge */}
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          color: severityStyle.color,
                          background: severityStyle.bg,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        {issue.severity === 'error' && <AlertTriangle size={9} />}
                        {issue.severity}
                      </span>

                      {/* Scene reference — clickable */}
                      <button
                        type="button"
                        onClick={() => scrollToScene(issue.sceneIndex)}
                        style={{
                          marginLeft: 'auto',
                          fontSize: '9px',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#60a5fa',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                        }}
                        title={`Jump to ${sceneLabel}`}
                      >
                        {sceneLabel.length > 40 ? sceneLabel.slice(0, 40) + '...' : sceneLabel}
                      </button>
                    </div>

                    {/* Description */}
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: "'Inter', sans-serif",
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        marginBottom: issue.evidence ? '6px' : 0,
                      }}
                    >
                      {issue.description}
                    </div>

                    {/* Evidence */}
                    {issue.evidence && (
                      <div
                        style={{
                          fontSize: '10px',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-secondary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {issue.evidence}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
