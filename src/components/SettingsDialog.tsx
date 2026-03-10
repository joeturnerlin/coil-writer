import { Eye, EyeOff, X } from 'lucide-react'
import { useState } from 'react'
import { AVAILABLE_MODELS } from '../lib/ai-provider'
import type { AIProvider } from '../lib/ai-provider'
import { useAIStore } from '../store/ai-store'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    provider, model, apiKeys, setProvider, setModel, setApiKey,
    comparisonEnabled, comparisonProviderA, comparisonModelA,
    comparisonProviderB, comparisonModelB,
    setComparisonEnabled, setComparisonModels,
  } = useAIStore()
  const [showKey, setShowKey] = useState(false)

  if (!open) return null

  const modelsForProvider = AVAILABLE_MODELS.filter((m) => m.provider === provider)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    padding: '8px 12px',
    borderRadius: 'var(--card-radius)',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    marginBottom: '6px',
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
        style={{
          width: '440px',
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
            Settings
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
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Provider */}
          <div>
            <label style={labelStyle}>AI Provider</label>
            <select
              style={inputStyle}
              value={provider}
              onChange={(e) => {
                const p = e.target.value as AIProvider
                setProvider(p)
                const firstModel = AVAILABLE_MODELS.find((m) => m.provider === p)
                if (firstModel) setModel(firstModel.id)
              }}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google (Gemini)</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label style={labelStyle}>Model</label>
            <select
              style={inputStyle}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {modelsForProvider.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label style={labelStyle}>API Key ({provider})</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                type={showKey ? 'text' : 'password'}
                placeholder={`Enter ${provider} API key`}
                value={apiKeys[provider]}
                onChange={(e) => setApiKey(provider, e.target.value)}
              />
              <button
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--btn-radius)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p
              style={{
                fontSize: '10px',
                color: 'var(--text-dim)',
                marginTop: '6px',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {provider === 'google'
                ? 'Works directly from browser. No proxy needed.'
                : 'Requires dev server proxy (works in npm run dev).'}
            </p>
          </div>
        </div>

        {/* Comparison Mode */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <label style={labelStyle}>Model Comparison</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={comparisonEnabled}
                onChange={(e) => setComparisonEnabled(e.target.checked)}
                style={{ accentColor: 'var(--accent-cyan)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>
                Enable side-by-side model comparison
              </span>
            </div>

            {comparisonEnabled && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '9px', marginBottom: '4px', display: 'block' }}>Model A</label>
                  <select
                    style={{ ...inputStyle, fontSize: '11px' }}
                    value={`${comparisonProviderA}:${comparisonModelA}`}
                    onChange={(e) => {
                      const [prov, ...rest] = e.target.value.split(':')
                      setComparisonModels(
                        prov as AIProvider, rest.join(':'),
                        comparisonProviderB, comparisonModelB
                      )
                    }}
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={`${m.provider}:${m.id}`}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '9px', marginBottom: '4px', display: 'block' }}>Model B</label>
                  <select
                    style={{ ...inputStyle, fontSize: '11px' }}
                    value={`${comparisonProviderB}:${comparisonModelB}`}
                    onChange={(e) => {
                      const [prov, ...rest] = e.target.value.split(':')
                      setComparisonModels(
                        comparisonProviderA, comparisonModelA,
                        prov as AIProvider, rest.join(':')
                      )
                    }}
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={`${m.provider}:${m.id}`}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
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
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
