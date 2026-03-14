import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { markLines } from '../editor/revision-gutter'
import { requestRewrite } from '../lib/ai-provider'
import { useAIStore } from '../store/ai-store'
import { useEditorStore } from '../store/editor-store'
import { useRevisionStore } from '../store/revision-store'

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

  const apiKey = apiKeys[provider] || ''

  // Initialize custom text from selection
  useEffect(() => {
    if (rewriteSelection) {
      setCustomText(rewriteSelection.text)
      setInstruction('')
    }
  }, [rewriteSelection])

  // Auto-trigger rewrite on mount
  const triggerRewrite = useCallback(async () => {
    if (!rewriteSelection) return
    if (!apiKey) {
      setError(`No API key set for ${provider}. Add one in Settings (gear icon).`)
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

  // Don't render when comparison mode is active — DualRewritePopup handles it
  if (!rewriteSelection || comparisonEnabled) return null

  const handleAccept = (text: string, isCustom = false) => {
    const view = viewRef?.current
    if (!view) return

    // Get line number before the edit
    const lineNumber = view.state.doc.lineAt(rewriteSelection.from).number

    // Apply the text change
    view.dispatch({
      changes: { from: rewriteSelection.from, to: rewriteSelection.to, insert: text },
    })

    // Log the revision
    const newLineCount = text.split('\n').length
    const changedLines: number[] = []
    for (let i = 0; i < newLineCount; i++) {
      changedLines.push(lineNumber + i)
    }

    useRevisionStore.getState().addRevision({
      from: rewriteSelection.from,
      to: rewriteSelection.to,
      originalText: rewriteSelection.text,
      newText: text,
      type: isCustom ? 'manual-edit' : 'ai-rewrite',
      lineNumber,
    })

    // Mark the changed lines in the gutter
    if (changedLines.length > 0) {
      view.dispatch({ effects: markLines.of(changedLines) })
    }

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
            Rewrite
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
            placeholder="Direction (e.g., 'make more tense', 'add sensory detail')"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleReroll()
              }
            }}
            autoFocus
          />
        </div>

        {/* No profile nudge */}
        {!currentProfile && !isLoading && suggestions.length === 0 && !error && (
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
                background: 'rgba(255, 152, 0, 0.15)',
                border: '1px solid #ff9800',
                color: '#ff9800',
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
              <span style={labelStyle}>AI Suggestions</span>
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
                  Insert
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Custom text — always visible once popup is open */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ ...labelStyle, marginBottom: '8px' }}>Your edit</div>
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
            placeholder="Write your own version here..."
          />
          <button
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              borderRadius: 'var(--card-radius)',
              cursor: customText.trim() && customText !== rewriteSelection.text ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
              background: customText.trim() && customText !== rewriteSelection.text ? 'var(--accent-cyan)' : 'var(--bg-hover)',
              color: customText.trim() && customText !== rewriteSelection.text ? '#0a0a0f' : 'var(--text-muted)',
              border: 'none',
              opacity: customText.trim() && customText !== rewriteSelection.text ? 1 : 0.5,
            }}
            onClick={() => {
              if (customText.trim() && customText !== rewriteSelection.text) {
                handleAccept(customText, true)
              }
            }}
            type="button"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
