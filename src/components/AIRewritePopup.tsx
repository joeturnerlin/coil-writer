import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requestRewrite } from '../lib/ai-provider'
import { useAIStore } from '../store/ai-store'
import { useEditorStore } from '../store/editor-store'

export function AIRewritePopup() {
  const {
    rewriteSelection,
    suggestions,
    isLoading,
    error,
    provider,
    model,
    apiKeys,
    currentProfile,
    setLoading,
    setSuggestions,
    setError,
    clearRewrite,
    comparisonEnabled,
  } = useAIStore()
  const { viewRef } = useEditorStore()
  const [customText, setCustomText] = useState('')
  const [instruction, setInstruction] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)

  const apiKey = apiKeys[provider]

  // Auto-trigger rewrite on mount
  const triggerRewrite = useCallback(async () => {
    if (!rewriteSelection || !apiKey) {
      if (!apiKey) setError('No API key configured. Open Settings to add one.')
      return
    }

    setLoading(true)
    try {
      const result = await requestRewrite(
        rewriteSelection.text,
        rewriteSelection.context,
        instruction || 'Rewrite this to be more compelling and vivid.',
        provider,
        model,
        apiKey,
        currentProfile,
      )
      setSuggestions(result.suggestions)
      setCustomText(rewriteSelection.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [rewriteSelection, apiKey, provider, model, instruction, currentProfile, setLoading, setSuggestions, setError])

  useEffect(() => {
    if (rewriteSelection && suggestions.length === 0 && !isLoading && !error) {
      triggerRewrite()
    }
  }, [rewriteSelection, suggestions.length, isLoading, error, triggerRewrite])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearRewrite()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearRewrite])

  if (!rewriteSelection) return null

  const handleAccept = (text: string) => {
    const view = viewRef?.current
    if (!view) return
    view.dispatch({
      changes: { from: rewriteSelection.from, to: rewriteSelection.to, insert: text },
    })
    clearRewrite()
  }

  const handleReroll = () => {
    setSuggestions([])
    setError(null)
    triggerRewrite()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '11px',
    fontFamily: "'Inter', sans-serif",
    padding: '8px 12px',
    borderRadius: 'var(--card-radius)',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
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
    >
      <div
        ref={popupRef}
        style={{
          width: '520px',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
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
          }}
        >
          <div>
            <div
              style={{
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-primary)',
              }}
            >
              AI Rewrite
            </div>
            <div style={{ ...labelStyle, marginTop: '2px' }}>{model}</div>
          </div>
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
            onClick={clearRewrite}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {/* Original text */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ ...labelStyle, marginBottom: '6px' }}>Original</div>
          <div
            style={{
              fontSize: '12px',
              fontFamily: "'Courier Prime', monospace",
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
            }}
          >
            {rewriteSelection.text}
          </div>
        </div>

        {/* Instruction field */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <input
            style={inputStyle}
            placeholder="Instruction (e.g., 'make more tense', 'add sensory detail')"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleReroll()
              }
            }}
          />
        </div>

        {/* No profile nudge */}
        {!currentProfile && !isLoading && suggestions.length === 0 && (
          <div
            style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '10px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            No voice profile. Rewrites may not match your script's tone.
            <button
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                borderRadius: 'var(--btn-radius)',
                cursor: 'pointer',
                background: 'var(--accent-cyan-dim)',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
              }}
              onClick={() => {
                clearRewrite()
              }}
              type="button"
            >
              Analyze
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div
            style={{
              padding: '24px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: 'var(--text-muted)',
            }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}>
              Generating suggestions...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ padding: '14px 20px' }}>
            <div
              style={{
                fontSize: '11px',
                fontFamily: "'Inter', sans-serif",
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--card-radius)',
                padding: '10px 14px',
              }}
            >
              {error}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={{ padding: '14px 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span style={labelStyle}>Suggestions</span>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                  borderRadius: 'var(--btn-radius)',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                }}
                onClick={handleReroll}
                type="button"
              >
                <RefreshCw size={10} />
                Re-roll
              </button>
            </div>

            {suggestions.map((s, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '8px',
                  padding: '14px',
                  borderRadius: 'var(--card-radius)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
                onClick={() => handleAccept(s.text)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-cyan)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontFamily: "'Courier Prime', monospace",
                    color: 'var(--text-primary)',
                    marginBottom: '6px',
                    lineHeight: '1.6',
                  }}
                >
                  {s.text}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontFamily: "'Inter', sans-serif",
                    marginBottom: '6px',
                  }}
                >
                  {s.reasoning}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--accent-cyan)',
                  }}
                >
                  <Check size={10} />
                  Click to accept
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compare with another model */}
        {comparisonEnabled && suggestions.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-color)' }}>
            <button
              style={{
                width: '100%', padding: '8px 12px', fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                borderRadius: 'var(--card-radius)', cursor: 'pointer',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                color: 'var(--text-primary)', transition: 'all 0.15s ease',
              }}
              onClick={() => {
                // Switch to comparison mode — DualRewritePopup will pick up rewriteSelection
                useAIStore.getState().setSuggestions([])
              }}
              type="button"
            >
              Compare with another model
            </button>
          </div>
        )}

        {/* Custom text */}
        {suggestions.length > 0 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ ...labelStyle, marginBottom: '8px' }}>Or write your own</div>
            <textarea
              style={{
                ...inputStyle,
                fontFamily: "'Courier Prime', monospace",
                fontSize: '12px',
                resize: 'none',
                marginBottom: '8px',
              }}
              rows={3}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
            <button
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                borderRadius: 'var(--card-radius)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: 'var(--accent-cyan)',
                color: '#0a0a0f',
                border: 'none',
              }}
              onClick={() => handleAccept(customText)}
              type="button"
            >
              Use Custom Text
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
