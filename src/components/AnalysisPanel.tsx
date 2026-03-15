import { Loader2, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeScript, analyzeScriptViaProxy, buildAnalysisSummary } from '../lib/script-analysis'
import { hashScript } from '../lib/voice-profile'
import { useAIStore } from '../store/ai-store'
import { useCharacterStore } from '../store/character-store'
import { useEditorStore } from '../store/editor-store'

export function AnalysisPanel() {
  const { content } = useEditorStore()
  const { analysisState, setAnalysisState, setCurrentProfile, apiKeys } = useAIStore()
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed timer during analysis
  useEffect(() => {
    if (analysisState.status === 'analyzing') {
      const start = analysisState.startedAt
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
    setElapsed(0)
  }, [analysisState])

  const runAnalysis = useCallback(async () => {
    if (!content) return

    abortRef.current = new AbortController()
    setAnalysisState({ status: 'sending' })

    try {
      setAnalysisState({ status: 'analyzing', startedAt: Date.now() })

      const geminiKey = apiKeys.google
      let profile: import('../lib/voice-profile').VoiceProfile

      if (geminiKey) {
        profile = await analyzeScript(content, geminiKey, undefined, abortRef.current.signal)
      } else {
        profile = await analyzeScriptViaProxy(content, abortRef.current.signal)
      }

      const hash = await hashScript(content)
      setCurrentProfile(profile, hash)
      useCharacterStore.getState().setBaseProfiles(profile.characters)
      setAnalysisState({
        status: 'complete',
        summary: buildAnalysisSummary(profile),
        profile,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setAnalysisState({ status: 'idle' })
        return
      }
      setAnalysisState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Analysis failed',
      })
    }
  }, [content, apiKeys.google, setAnalysisState, setCurrentProfile])

  const handleCancel = () => {
    abortRef.current?.abort()
    setAnalysisState({ status: 'idle' })
  }

  if (analysisState.status === 'idle') return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '40px',
        right: '20px',
        zIndex: 40,
        width: '320px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--card-radius)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom:
            analysisState.status === 'complete' || analysisState.status === 'error'
              ? 'none'
              : '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(analysisState.status === 'sending' || analysisState.status === 'analyzing') && (
            <Loader2 size={14} style={{ color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite' }} />
          )}
          {analysisState.status === 'complete' && <Sparkles size={14} style={{ color: 'var(--accent-cyan)' }} />}
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {analysisState.status === 'sending' && 'Sending script...'}
            {analysisState.status === 'analyzing' && `Analyzing... (${elapsed}s)`}
            {analysisState.status === 'complete' && 'Analysis complete'}
            {analysisState.status === 'error' && 'Analysis failed'}
          </span>
        </div>
        <button
          style={{
            padding: '2px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
          }}
          onClick={() => {
            if (analysisState.status === 'sending' || analysisState.status === 'analyzing') {
              handleCancel()
            } else {
              setAnalysisState({ status: 'idle' })
            }
          }}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {analysisState.status === 'complete' && (
        <div style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--text-secondary)' }}>
          {analysisState.summary}
          <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>Your next rewrite will use this profile.</div>
        </div>
      )}

      {analysisState.status === 'error' && (
        <div style={{ padding: '10px 14px', fontSize: '10px', color: '#ef4444' }}>
          {analysisState.message}
          <button
            style={{
              display: 'block',
              marginTop: '8px',
              padding: '4px 10px',
              fontSize: '10px',
              fontFamily: 'inherit',
              fontWeight: 600,
              borderRadius: 'var(--btn-radius)',
              cursor: 'pointer',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
            onClick={runAnalysis}
            type="button"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Hook to trigger analysis from other components.
 */
export function useAnalysis() {
  const { content } = useEditorStore()
  const { apiKeys, setAnalysisState, setCurrentProfile } = useAIStore()

  return useCallback(async () => {
    if (!content) return

    const abortController = new AbortController()
    setAnalysisState({ status: 'analyzing', startedAt: Date.now() })

    try {
      const geminiKey = apiKeys.google
      let profile: import('../lib/voice-profile').VoiceProfile

      if (geminiKey) {
        profile = await analyzeScript(content, geminiKey, undefined, abortController.signal)
      } else {
        profile = await analyzeScriptViaProxy(content, abortController.signal)
      }

      const hash = await hashScript(content)
      setCurrentProfile(profile, hash)
      useCharacterStore.getState().setBaseProfiles(profile.characters)
      setAnalysisState({
        status: 'complete',
        summary: buildAnalysisSummary(profile),
        profile,
      })
    } catch (err) {
      setAnalysisState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Analysis failed',
      })
    }
  }, [content, apiKeys.google, setAnalysisState, setCurrentProfile])
}
