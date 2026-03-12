import { Check, Loader2, Play, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { requestRewrite, type RewriteSuggestion } from '../lib/ai-provider'
import { useAIStore } from '../store/ai-store'
import { useEditorStore } from '../store/editor-store'

export function DualRewritePopup() {
  const {
    rewriteSelection,
    comparisonProviderA,
    comparisonModelA,
    comparisonProviderB,
    comparisonModelB,
    comparisonSuggestionsA,
    comparisonSuggestionsB,
    comparisonLoadingA,
    comparisonLoadingB,
    comparisonErrorA,
    comparisonErrorB,
    apiKeys,
    currentProfile,
    setComparisonLoadingA,
    setComparisonLoadingB,
    setComparisonResultsA,
    setComparisonResultsB,
    recordPreference,
    clearRewrite,
  } = useAIStore()
  const { viewRef } = useEditorStore()
  const [instruction, setInstruction] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Clear instruction when modal opens with new selection
  useEffect(() => {
    if (rewriteSelection) {
      setInstruction('')
      setShowAll(false)
    }
  }, [rewriteSelection])

  const modelAName = comparisonModelA.split('-').slice(0, 2).join(' ')
  const modelBName = comparisonModelB.split('-').slice(0, 2).join(' ')

  const triggerComparison = useCallback(async () => {
    if (!rewriteSelection) return

    const keyA = apiKeys[comparisonProviderA] || ''
    const keyB = apiKeys[comparisonProviderB] || ''

    // Fire both in parallel — server has its own env var keys as fallback
    setComparisonLoadingA(true)
    requestRewrite(
      rewriteSelection.text,
      rewriteSelection.context,
      instruction || 'Rewrite this to be more compelling and vivid.',
      comparisonProviderA,
      comparisonModelA,
      keyA,
      currentProfile,
    )
      .then((r) => setComparisonResultsA(r.suggestions, null))
      .catch((e) => setComparisonResultsA(null, e instanceof Error ? e.message : 'Failed'))

    setComparisonLoadingB(true)
    requestRewrite(
      rewriteSelection.text,
      rewriteSelection.context,
      instruction || 'Rewrite this to be more compelling and vivid.',
      comparisonProviderB,
      comparisonModelB,
      keyB,
      currentProfile,
    )
      .then((r) => setComparisonResultsB(r.suggestions, null))
      .catch((e) => setComparisonResultsB(null, e instanceof Error ? e.message : 'Failed'))
  }, [
    rewriteSelection, instruction, apiKeys, currentProfile,
    comparisonProviderA, comparisonModelA, comparisonProviderB, comparisonModelB,
    setComparisonLoadingA, setComparisonLoadingB, setComparisonResultsA, setComparisonResultsB,
  ])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearRewrite()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearRewrite])

  if (!rewriteSelection) return null

  const handleAccept = (text: string, fromModel: string) => {
    const view = viewRef?.current
    if (!view) return
    view.dispatch({
      changes: { from: rewriteSelection.from, to: rewriteSelection.to, insert: text },
    })
    recordPreference(fromModel)
    clearRewrite()
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  }

  const renderColumn = (
    modelName: string,
    modelId: string,
    suggestions: RewriteSuggestion[] | null,
    loading: boolean,
    error: string | null,
  ) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...labelStyle, marginBottom: '8px', textAlign: 'center' }}>{modelName}</div>

      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '10px' }}>Generating...</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', fontSize: '10px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--card-radius)' }}>
          {error}
        </div>
      )}

      {suggestions && suggestions.slice(0, showAll ? 2 : 1).map((s, i) => (
        <div
          key={i}
          style={{
            padding: '12px',
            marginBottom: '6px',
            borderRadius: 'var(--card-radius)',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease',
          }}
          onClick={() => handleAccept(s.text, modelId)}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-cyan)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
        >
          <div style={{ fontSize: '11px', fontFamily: "'Courier Prime', monospace", color: 'var(--text-primary)', lineHeight: '1.6', marginBottom: '6px' }}>
            {s.text}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>
            {s.reasoning}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-cyan)' }}>
            <Check size={10} /> Accept
          </div>
        </div>
      ))}
    </div>
  )

  const hasBothResults = (comparisonSuggestionsA || comparisonErrorA) && (comparisonSuggestionsB || comparisonErrorB)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: '680px', maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-primary)' }}>
              Model Comparison
            </div>
            <div style={{ ...labelStyle, marginTop: '2px' }}>{modelAName} vs {modelBName}</div>
          </div>
          <button
            style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--btn-radius)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            onClick={clearRewrite}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {/* Original text */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Original</div>
          <div style={{ fontSize: '11px', fontFamily: "'Courier Prime', monospace", color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {rewriteSelection.text.length > 150 ? rewriteSelection.text.slice(0, 150) + '...' : rewriteSelection.text}
          </div>
        </div>

        {/* Instruction + Generate */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            style={{
              flex: 1, fontSize: '11px', fontFamily: "'Inter', sans-serif",
              padding: '8px 12px', borderRadius: 'var(--card-radius)', background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)', color: 'var(--text-primary)',
            }}
            placeholder="Instruction (e.g., 'make more tense')"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); triggerComparison() } }}
            autoFocus
          />
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
              fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              borderRadius: 'var(--btn-radius)', cursor: 'pointer',
              background: 'var(--accent-cyan)', border: 'none', color: 'var(--bg-primary)',
            }}
            onClick={triggerComparison}
            disabled={comparisonLoadingA || comparisonLoadingB}
            type="button"
          >
            <Play size={10} /> Generate
          </button>
        </div>

        {/* Comparison grid */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: '16px' }}>
          {renderColumn(modelAName, comparisonModelA, comparisonSuggestionsA, comparisonLoadingA, comparisonErrorA)}
          <div style={{ width: '1px', background: 'var(--border-color)', flexShrink: 0 }} />
          {renderColumn(modelBName, comparisonModelB, comparisonSuggestionsB, comparisonLoadingB, comparisonErrorB)}
        </div>

        {/* Show more + Re-roll */}
        {hasBothResults && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, borderRadius: 'var(--btn-radius)', cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
              onClick={() => setShowAll(!showAll)}
              type="button"
            >
              {showAll ? 'Show less' : 'Show all suggestions'}
            </button>
            <button
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, borderRadius: 'var(--btn-radius)', cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
              onClick={() => {
                setComparisonResultsA(null, null)
                setComparisonResultsB(null, null)
                triggerComparison()
              }}
              type="button"
            >
              <RefreshCw size={10} /> Re-roll both
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
