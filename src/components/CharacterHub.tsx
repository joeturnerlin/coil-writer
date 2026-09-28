import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { setSubtextFlags } from '../editor/subtext-decorations'
import { type ContinuityIssue, type ContinuityResult, checkContinuity } from '../lib/continuity-check'
import type { SubtextFlag } from '../lib/subtext-analysis'
import { analyzeSubtext } from '../lib/subtext-analysis'
import { useAIStore } from '../store/ai-store'
import { useCharacterStore } from '../store/character-store'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSettingsStore } from '../store/settings-store'
import { useStatusLog } from '../store/status-log-store'
import { useSubscriptionStore } from '../store/subscription-store'
import { useAnalysis } from './AnalysisPanel'
import { CharacterCard } from './CharacterCard'
import { StatusLog } from './StatusLog'

// ── Shared button style for the 3 action buttons ──

const actionBtnBase: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '5px 2px',
  fontSize: '9px',
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  borderRadius: 'var(--btn-radius)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  background: 'transparent',
  border: '1px solid var(--border-color)',
  color: 'var(--text-muted)',
}

const actionBtnActive: React.CSSProperties = {
  ...actionBtnBase,
  border: '1px solid #ff9800',
  color: '#ff9800',
}

const actionBtnLoading: React.CSSProperties = {
  ...actionBtnBase,
  border: '1px solid var(--accent-cyan, #00f0ff)',
  color: 'var(--accent-cyan, #00f0ff)',
  opacity: 0.7,
  cursor: 'default',
}

// ── Subtext result card ──

function SubtextCard({ flag, sceneFrom }: { flag: SubtextFlag; sceneFrom: number }) {
  const [hovered, setHovered] = useState(false)
  const CATEGORY_LABELS: Record<string, string> = {
    'literal-emotion': 'Literal Emotion',
    'exposition-dump': 'Exposition Dump',
    'thematic-broadcasting': 'Thematic',
  }
  const label = CATEGORY_LABELS[flag.category] || flag.category

  const goTo = () => {
    const view = useEditorStore.getState().viewRef?.current
    if (!view) return
    const lineNum = sceneFrom > 0 ? sceneFrom + flag.lineNumber - 1 : flag.lineNumber
    if (lineNum < 1 || lineNum > view.state.doc.lines) return
    const line = view.state.doc.line(lineNum)
    view.dispatch({ selection: { anchor: line.from } })
    const block = view.lineBlockAt(line.from)
    view.scrollDOM.scrollTo({ top: block.top - 40, behavior: 'smooth' })
    view.focus()
  }

  return (
    <div
      style={{
        padding: '8px 10px',
        margin: '0 8px 6px',
        borderRadius: '4px',
        borderLeft: '3px solid #fbbf24',
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
        cursor: 'pointer',
        transition: 'background 0.1s ease',
      }}
      onClick={goTo}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <span
          style={{
            fontSize: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            padding: '1px 5px',
            borderRadius: '3px',
            background: 'rgba(251, 191, 36, 0.15)',
            color: '#fbbf24',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            color: flag.confidence === 'high' ? '#ef5350' : '#ff9800',
            fontWeight: 600,
          }}
        >
          {flag.confidence}
        </span>
      </div>
      <div
        style={{
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {flag.character}: &ldquo;{flag.text}&rdquo;
      </div>
      {flag.suggestion && (
        <div
          style={{
            fontSize: '9px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            marginTop: '3px',
            lineHeight: 1.3,
          }}
        >
          Try: {flag.suggestion}
        </div>
      )}
    </div>
  )
}

// ── Continuity result card ──

const CONTINUITY_COLORS: Record<ContinuityIssue['type'], string> = {
  character: '#60a5fa',
  prop: '#fbbf24',
  timeline: '#f87171',
  location: '#4ade80',
  logic: '#c084fc',
}

function ContinuityCard({ issue }: { issue: ContinuityIssue }) {
  const [hovered, setHovered] = useState(false)
  const color = CONTINUITY_COLORS[issue.type] || '#888'
  const scenes = useScriptStore((s) => s.scenes)

  const goTo = () => {
    const scene = scenes.find((s) => s.index === issue.sceneIndex)
    if (!scene) return
    const view = useEditorStore.getState().viewRef?.current
    if (!view) return
    view.dispatch({ selection: { anchor: scene.from } })
    const block = view.lineBlockAt(scene.from)
    view.scrollDOM.scrollTo({ top: block.top - 40, behavior: 'smooth' })
    view.focus()
  }

  return (
    <div
      style={{
        padding: '8px 10px',
        margin: '0 8px 6px',
        borderRadius: '4px',
        borderLeft: `3px solid ${color}`,
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
        cursor: 'pointer',
        transition: 'background 0.1s ease',
      }}
      onClick={goTo}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <span
          style={{
            fontSize: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            padding: '1px 5px',
            borderRadius: '3px',
            background: `${color}22`,
            color,
          }}
        >
          {issue.type}
        </span>
        <span
          style={{
            fontSize: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            color: issue.severity === 'error' ? '#f87171' : '#fbbf24',
            fontWeight: 600,
          }}
        >
          {issue.severity}
        </span>
      </div>
      <div
        style={{
          fontSize: '10px',
          fontFamily: "'Inter', sans-serif",
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
        }}
      >
        {issue.description}
      </div>
      {issue.evidence && (
        <div
          style={{
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            marginTop: '3px',
          }}
        >
          {issue.evidence}
        </div>
      )}
    </div>
  )
}

// ── Main component ──

export function CharacterHub() {
  const { setEditorMode } = useSettingsStore()
  const { baseProfiles } = useCharacterStore()
  const { currentProfile, analysisState, subtextLoading, subtextResult } = useAIStore()
  const triggerAnalysis = useAnalysis()
  const isAnalyzing = analysisState.status === 'analyzing' || analysisState.status === 'sending'
  const { incrementUsage } = useSubscriptionStore()
  const log = useStatusLog((s) => s.log)

  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null)
  const [continuityResult, setContinuityResult] = useState<ContinuityResult | null>(null)
  const [continuityLoading, setContinuityLoading] = useState(false)

  // Track the scene offset for subtext flags (for "go to" navigation)
  const [subtextSceneFrom, setSubtextSceneFrom] = useState(0)

  // Auto-detect BYOK from API keys
  useEffect(() => {
    const keys = useAIStore.getState().apiKeys
    const hasKey = Object.values(keys).some((k) => k.trim().length > 0)
    if (hasKey) useSubscriptionStore.getState().setBYOK(true)
  }, [])

  // Sync cached profile into character store on mount
  useEffect(() => {
    if (currentProfile && currentProfile.characters.length > 0 && baseProfiles.length === 0) {
      useCharacterStore.getState().setBaseProfiles(currentProfile.characters)
    }
  }, [currentProfile, baseProfiles.length])

  // Log analysis state changes
  useEffect(() => {
    if (analysisState.status === 'complete' && 'summary' in analysisState) {
      log('success', `Voice: ${analysisState.summary}`)
    }
    if (analysisState.status === 'error' && 'message' in analysisState) {
      log('error', `Voice: ${analysisState.message}`)
    }
  }, [analysisState.status, log])

  const handleToggle = (name: string) => {
    setExpandedCharacter((prev) => (prev === name ? null : name))
  }

  // ── Action handlers ──

  const handleVoices = () => {
    if (isAnalyzing) return
    log('progress', 'Analyzing voices...')
    triggerAnalysis()
  }

  const handleSubtext = async () => {
    if (subtextLoading) return

    const scenes = useScriptStore.getState().scenes
    const cursorLine = useEditorStore.getState().cursorLine
    const viewRef = useEditorStore.getState().viewRef

    let scene: import('../lib/scene-model').SceneBlock | undefined = scenes[0]
    if (scenes.length > 0 && cursorLine > 0 && viewRef?.current) {
      const cursorPos = viewRef.current.state.doc.line(cursorLine).from
      for (const s of scenes) {
        if (cursorPos >= s.from && cursorPos < s.to) {
          scene = s
          break
        }
      }
    }
    if (!scene || scene.dialogueLines === 0) {
      scene = scenes.find((s) => s.dialogueLines > 0)
    }
    if (!scene) {
      log('warning', 'No dialogue scenes to analyze')
      return
    }

    log('progress', `Checking subtext — ${scene.heading || 'current scene'}...`)
    useAIStore.getState().setSubtextLoading(true)
    try {
      const result = await analyzeSubtext(scene)
      useAIStore.getState().setSubtextResult(result)
      incrementUsage('subtext')

      // Track scene offset for card navigation
      const view = useEditorStore.getState().viewRef?.current
      if (view) {
        const sceneStartLine = view.state.doc.lineAt(scene.from).number
        setSubtextSceneFrom(sceneStartLine)
        if (result.flags.length > 0) {
          const absoluteFlags = result.flags.map((flag) => ({
            ...flag,
            lineNumber: sceneStartLine + flag.lineNumber - 1,
          }))
          view.dispatch({ effects: setSubtextFlags.of(absoluteFlags) })
        }
      }

      log('success', `Subtext: ${result.summary}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Subtext analysis failed'
      useAIStore.getState().setSubtextError(msg)
      log('error', `Subtext: ${msg}`)
    }
  }

  const handleContinuity = async () => {
    if (continuityLoading) return

    const scenes = useScriptStore.getState().scenes
    if (scenes.length === 0) {
      log('warning', 'No scenes to check')
      return
    }

    log('progress', 'Checking continuity...')
    setContinuityLoading(true)
    try {
      const result = await checkContinuity(scenes)
      setContinuityResult(result)
      incrementUsage('continuity')
      log('success', `Continuity: ${result.summary}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Continuity check failed'
      log('error', `Continuity: ${msg}`)
    } finally {
      setContinuityLoading(false)
    }
  }

  // Collect result cards for the scrollable area
  const subtextFlags = subtextResult?.flags ?? []
  const continuityIssues = continuityResult?.issues ?? []

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
          padding: '10px 12px',
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
          Analyze
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
          onClick={() => setEditorMode('write')}
          type="button"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Action buttons — always visible */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
        <button
          style={isAnalyzing ? actionBtnLoading : actionBtnActive}
          onClick={handleVoices}
          disabled={isAnalyzing}
          type="button"
          title="Analyze character voices"
        >
          {isAnalyzing ? '...' : 'Voices'}
        </button>
        <button
          style={subtextLoading ? actionBtnLoading : actionBtnActive}
          onClick={handleSubtext}
          disabled={subtextLoading}
          type="button"
          title="Check subtext"
        >
          {subtextLoading ? '...' : 'Subtext'}
        </button>
        <button
          style={continuityLoading ? actionBtnLoading : actionBtnActive}
          onClick={handleContinuity}
          disabled={continuityLoading}
          type="button"
          title="Check continuity"
        >
          {continuityLoading ? '...' : 'Continuity'}
        </button>
      </div>

      {/* Scrollable content: characters + result cards */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Characters section */}
        {baseProfiles.length > 0 && (
          <>
            <div
              style={{
                padding: '8px 12px 4px',
                fontSize: '9px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
              }}
            >
              Characters ({baseProfiles.length})
            </div>
            {baseProfiles.map((profile) => (
              <CharacterCard
                key={profile.name}
                characterName={profile.name}
                isExpanded={expandedCharacter === profile.name}
                onToggle={() => handleToggle(profile.name)}
              />
            ))}
          </>
        )}

        {baseProfiles.length === 0 && !isAnalyzing && (
          <div
            style={{
              padding: '16px 12px',
              fontSize: '10px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-dim)',
              textAlign: 'center',
            }}
          >
            Click <strong>Voices</strong> to analyze characters
          </div>
        )}

        {/* Subtext flags */}
        {subtextFlags.length > 0 && (
          <>
            <div
              style={{
                padding: '10px 12px 4px',
                fontSize: '9px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
              }}
            >
              Subtext ({subtextFlags.length})
            </div>
            {subtextFlags.map((flag, i) => (
              <SubtextCard key={`st-${flag.lineNumber}-${i}`} flag={flag} sceneFrom={subtextSceneFrom} />
            ))}
          </>
        )}

        {/* Continuity issues */}
        {continuityIssues.length > 0 && (
          <>
            <div
              style={{
                padding: '10px 12px 4px',
                fontSize: '9px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
              }}
            >
              Continuity ({continuityIssues.length})
            </div>
            {continuityIssues.map((issue, i) => (
              <ContinuityCard key={`ci-${issue.sceneIndex}-${i}`} issue={issue} />
            ))}
          </>
        )}

        {/* Clean continuity result */}
        {continuityResult && continuityIssues.length === 0 && (
          <div
            style={{
              padding: '10px 12px',
              fontSize: '10px',
              fontFamily: "'Inter', sans-serif",
              color: '#4ade80',
              textAlign: 'center',
            }}
          >
            No continuity issues found
          </div>
        )}
      </div>

      {/* Status console */}
      <StatusLog />
    </div>
  )
}
