import { Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { setSubtextFlags } from '../editor/subtext-decorations'
import { type ContinuityResult, checkContinuity } from '../lib/continuity-check'
import { analyzeSubtext } from '../lib/subtext-analysis'
import { useAIStore } from '../store/ai-store'
import { useCharacterStore } from '../store/character-store'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSettingsStore } from '../store/settings-store'
import { useSubscriptionStore } from '../store/subscription-store'
import { useAnalysis } from './AnalysisPanel'
import { CharacterCard } from './CharacterCard'
import { ContinuityPanel } from './ContinuityPanel'

export function CharacterHub() {
  const { setEditorMode } = useSettingsStore()
  const { baseProfiles, staleFlags } = useCharacterStore()
  const { currentProfile, analysisState, subtextLoading, subtextResult, showMediumConfidence } = useAIStore()
  const triggerAnalysis = useAnalysis()
  const isAnalyzing = analysisState.status === 'analyzing' || analysisState.status === 'sending'
  const { canUse, remainingUses, incrementUsage } = useSubscriptionStore()

  // Sync cached profile into character store on mount
  useEffect(() => {
    if (currentProfile && currentProfile.characters.length > 0 && baseProfiles.length === 0) {
      useCharacterStore.getState().setBaseProfiles(currentProfile.characters)
    }
  }, [currentProfile, baseProfiles.length])

  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null)
  const [subtextTooltip, setSubtextTooltip] = useState<string | null>(null)
  const [continuityOpen, setContinuityOpen] = useState(false)
  const [continuityResult, setContinuityResult] = useState<ContinuityResult | null>(null)
  const [continuityLoading, setContinuityLoading] = useState(false)
  const [continuityTooltip, setContinuityTooltip] = useState<string | null>(null)

  const hasStaleFlags = useMemo(() => Object.values(staleFlags).some(Boolean), [staleFlags])

  const handleToggle = (name: string) => {
    setExpandedCharacter((prev) => (prev === name ? null : name))
  }

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
          Characters ({baseProfiles.length})
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
          title="Close Character Hub"
        >
          <X size={14} />
        </button>
      </div>

      {/* Stale indicator */}
      {hasStaleFlags && (
        <div
          style={{
            padding: '6px 16px',
            fontSize: '9px',
            fontFamily: "'Inter', sans-serif",
            fontStyle: 'italic',
            color: 'var(--mode-analyze-text)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          Profiles may be outdated &mdash;{' '}
          <span
            style={{ cursor: isAnalyzing ? 'default' : 'pointer', textDecoration: 'underline' }}
            onClick={() => !isAnalyzing && triggerAnalysis()}
          >
            Re-analyze
          </span>
        </div>
      )}

      {/* No profiles state */}
      {baseProfiles.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
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
            title="Analyze script to extract character voice profiles"
          >
            <Sparkles size={14} />
            Analyze Voice
          </button>
        </div>
      )}

      {/* Character card list */}
      {baseProfiles.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: '12px' }}>
          {baseProfiles.map((profile) => (
            <CharacterCard
              key={profile.name}
              characterName={profile.name}
              isExpanded={expandedCharacter === profile.name}
              onToggle={() => handleToggle(profile.name)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
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
            cursor: !canUse('subtext') || subtextLoading ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
            background: 'transparent',
            border: '1px solid #ff9800',
            color: '#ff9800',
            opacity: !canUse('subtext') || subtextLoading ? 0.4 : 1,
          }}
          disabled={!canUse('subtext') || subtextLoading}
          type="button"
          title={
            !canUse('subtext')
              ? `Used ${3 - remainingUses('subtext')}/3 subtext checks`
              : 'Analyze current scene for on-the-nose dialogue'
          }
          onClick={async () => {
            if (!canUse('subtext') || subtextLoading) {
              setSubtextTooltip(`Used ${3 - remainingUses('subtext')}/3 subtext checks`)
              setTimeout(() => setSubtextTooltip(null), 2000)
              return
            }

            const scenes = useScriptStore.getState().scenes
            const cursorLine = useEditorStore.getState().cursorLine
            const viewRef = useEditorStore.getState().viewRef

            // Find current scene from cursor position
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

            // If current scene has no dialogue (e.g. title page), find first scene with dialogue
            if (!scene || scene.dialogueLines === 0) {
              scene = scenes.find(s => s.dialogueLines > 0)
            }

            if (!scene) return

            useAIStore.getState().setSubtextLoading(true)

            try {
              const result = await analyzeSubtext(scene)
              useAIStore.getState().setSubtextResult(result)
              incrementUsage('subtext')

              // Dispatch flags to CM6 editor view
              const view = useEditorStore.getState().viewRef?.current
              if (view && result.flags.length > 0) {
                // Convert scene-relative line numbers to absolute document line numbers
                const sceneStartLine = view.state.doc.lineAt(scene.from).number
                const absoluteFlags = result.flags.map((flag) => ({
                  ...flag,
                  lineNumber: sceneStartLine + flag.lineNumber - 1,
                }))
                view.dispatch({ effects: setSubtextFlags.of(absoluteFlags) })
              }
            } catch (err) {
              useAIStore.getState().setSubtextError(err instanceof Error ? err.message : 'Subtext analysis failed')
            }
          }}
        >
          {subtextLoading ? 'Analyzing...' : 'Check Subtext'}
        </button>
        {subtextTooltip && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--structure-gap)',
              textAlign: 'center',
            }}
          >
            {subtextTooltip}
          </div>
        )}
        {!canUse('subtext') && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Used {3 - remainingUses('subtext')}/3 subtext checks
          </div>
        )}
        {subtextResult && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {subtextResult.summary}
          </div>
        )}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            marginTop: '8px',
            fontSize: '9px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showMediumConfidence}
            onChange={() => useAIStore.getState().toggleMediumConfidence()}
            style={{ width: '10px', height: '10px' }}
          />
          Show medium confidence
        </label>

        {/* Check Continuity button */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '8px 12px',
            marginTop: '10px',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            borderRadius: 'var(--btn-radius)',
            cursor: !canUse('continuity') || continuityLoading ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
            background: 'transparent',
            border: '1px solid #ff9800',
            color: '#ff9800',
            opacity: !canUse('continuity') || continuityLoading ? 0.4 : 1,
          }}
          disabled={!canUse('continuity') || continuityLoading}
          type="button"
          title={
            !canUse('continuity')
              ? `Used ${1 - remainingUses('continuity')}/1 checks`
              : 'Check full script for continuity issues'
          }
          onClick={async () => {
            if (!canUse('continuity') || continuityLoading) {
              setContinuityTooltip(`Used ${1 - remainingUses('continuity')}/1 checks`)
              setTimeout(() => setContinuityTooltip(null), 2000)
              return
            }

            const scenes = useScriptStore.getState().scenes
            if (scenes.length === 0) return

            setContinuityLoading(true)
            try {
              const result = await checkContinuity(scenes)
              setContinuityResult(result)
              setContinuityOpen(true)
              incrementUsage('continuity')
            } catch (err) {
              setContinuityTooltip(err instanceof Error ? err.message : 'Continuity check failed')
              setTimeout(() => setContinuityTooltip(null), 4000)
            } finally {
              setContinuityLoading(false)
            }
          }}
        >
          {continuityLoading ? 'Checking...' : 'Check Continuity'}
        </button>
        {continuityTooltip && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--structure-gap)',
              textAlign: 'center',
            }}
          >
            {continuityTooltip}
          </div>
        )}
        {!canUse('continuity') && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '9px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Used {1 - remainingUses('continuity')}/1 checks
          </div>
        )}
      </div>

      {/* Continuity Panel modal */}
      {continuityOpen && continuityResult && (
        <ContinuityPanel result={continuityResult} onClose={() => setContinuityOpen(false)} />
      )}
    </div>
  )
}
