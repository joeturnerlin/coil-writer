import { Plus, X as XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCharacterStore } from '../store/character-store'
import { useScriptStore } from '../store/script-store'
import { useSubscriptionStore } from '../store/subscription-store'

interface CharacterCardProps {
  characterName: string
  isExpanded: boolean
  onToggle: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: '9px',
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  marginBottom: '6px',
}

export function CharacterCard({ characterName, isExpanded, onToggle }: CharacterCardProps) {
  const { staleFlags, overrides, getEffectiveProfile, setOverride } = useCharacterStore()
  const canEditProfiles = useSubscriptionStore((s) => s.canUse('edit-profiles'))
  const scenes = useScriptStore((s) => s.scenes)

  const [forbiddenInput, setForbiddenInput] = useState('')
  const [vocabInput, setVocabInput] = useState('')
  const [isHovered, setIsHovered] = useState(false)

  const isStale = staleFlags[characterName] ?? false
  const profile = getEffectiveProfile(characterName)
  const currentOverrides = overrides[characterName]

  // Count dialogue lines for this character across all scenes
  const dialogueCount = useMemo(() => {
    let count = 0
    for (const scene of scenes) {
      if (scene.characters.includes(characterName)) {
        // Each scene that includes the character contributes dialogue lines
        // We approximate by checking presence — the scene model counts total dialogue
        count += scene.dialogueLines > 0 ? Math.ceil(scene.dialogueLines / Math.max(scene.characters.length, 1)) : 0
      }
    }
    return count
  }, [scenes, characterName])

  const updateOverride = (patch: Partial<ReturnType<typeof getOverrideDefaults>>) => {
    const base = currentOverrides ?? { source: 'manual' as const }
    setOverride(characterName, { ...base, ...patch, source: 'manual' })
  }

  const handleAddForbidden = () => {
    const val = forbiddenInput.trim()
    if (!val) return
    const existing = currentOverrides?.addedForbidden ?? []
    if (!existing.includes(val)) {
      updateOverride({ addedForbidden: [...existing, val] })
    }
    setForbiddenInput('')
  }

  const handleRemoveForbidden = (pattern: string) => {
    // If it's a user-added override, remove from addedForbidden
    const added = currentOverrides?.addedForbidden ?? []
    if (added.includes(pattern)) {
      updateOverride({ addedForbidden: added.filter((p) => p !== pattern) })
    } else {
      // It's a base pattern — add to removedForbidden
      const removed = currentOverrides?.removedForbidden ?? []
      if (!removed.includes(pattern)) {
        updateOverride({ removedForbidden: [...removed, pattern] })
      }
    }
  }

  const handleAddVocab = () => {
    const val = vocabInput.trim()
    if (!val) return
    const existing = currentOverrides?.addedVocabulary ?? []
    if (!existing.includes(val)) {
      updateOverride({ addedVocabulary: [...existing, val] })
    }
    setVocabInput('')
  }

  const handleFormalityChange = (val: string) => {
    updateOverride({ formality: val as 'street' | 'casual' | 'neutral' | 'formal' | 'ornate' })
  }

  const handleProfanityChange = (val: string) => {
    updateOverride({ profanity: val as 'none' | 'mild' | 'moderate' | 'heavy' })
  }

  const handleVoiceNotesChange = (val: string) => {
    updateOverride({ voiceNotes: val })
  }

  // Collapsed card
  if (!isExpanded) {
    return (
      <div
        style={{
          padding: 'var(--card-padding)',
          margin: '0 var(--card-margin-x) var(--card-margin-b)',
          borderRadius: 'var(--card-radius)',
          background: isHovered ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
          border: isHovered ? '1px solid var(--border-light)' : '1px solid var(--border-color)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '44px',
          boxSizing: 'border-box',
        }}
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {characterName}
          </span>
          {isStale && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#ff9800',
                display: 'inline-block',
                flexShrink: 0,
              }}
              title="Profile may be outdated"
            />
          )}
        </div>
        <span
          style={{
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--character-badge-bg)',
            color: 'var(--character-badge-text)',
          }}
        >
          {dialogueCount}
        </span>
      </div>
    )
  }

  // Expanded card
  const forbidden = profile?.forbidden_patterns ?? []
  const vocabulary = profile?.vocabulary ?? []
  const rhythm = profile?.rhythm
  const formality = profile?.formality_axis ?? 'neutral'
  const profanity = profile?.profanity_register ?? 'none'
  const voiceNotes = currentOverrides?.voiceNotes ?? ''

  const inputDisabled = !canEditProfiles

  const inputStyle: React.CSSProperties = {
    flex: 1,
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    padding: '4px 8px',
    borderRadius: '3px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    outline: 'none',
  }

  const addBtnStyle: React.CSSProperties = {
    padding: '4px 6px',
    background: 'none',
    border: '1px solid var(--border-color)',
    borderRadius: '3px',
    cursor: inputDisabled ? 'default' : 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    opacity: inputDisabled ? 0.4 : 1,
  }

  const proBadge = !canEditProfiles ? (
    <span
      style={{
        fontSize: '8px',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: '3px',
        background: 'rgba(255, 152, 0, 0.15)',
        color: '#ff9800',
        border: '1px solid rgba(255, 152, 0, 0.3)',
        marginLeft: '6px',
      }}
    >
      PRO
    </span>
  ) : null

  return (
    <div
      style={{
        padding: 'var(--card-padding)',
        margin: '0 var(--card-margin-x) var(--card-margin-b)',
        borderRadius: 'var(--card-radius)',
        background: 'var(--character-expand-bg)',
        border: '1px solid var(--mode-analyze-border)',
        cursor: 'default',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header row (clickable to collapse) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: '12px',
        }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {characterName}
          </span>
          {isStale && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#ff9800',
                display: 'inline-block',
                flexShrink: 0,
              }}
              title="Profile may be outdated"
            />
          )}
        </div>
        <span
          style={{
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--character-badge-bg)',
            color: 'var(--character-badge-text)',
          }}
        >
          {dialogueCount}
        </span>
      </div>

      {/* Section: Forbidden Patterns */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>Forbidden Patterns</span>
          {proBadge}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {forbidden.map((f) => (
            <div
              key={f.pattern}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-secondary)',
                padding: '2px 4px',
                borderRadius: '2px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.pattern}</span>
              <button
                style={{
                  padding: '1px',
                  background: 'none',
                  border: 'none',
                  cursor: inputDisabled ? 'default' : 'pointer',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  opacity: inputDisabled ? 0.3 : 0.6,
                }}
                onClick={() => !inputDisabled && handleRemoveForbidden(f.pattern)}
                disabled={inputDisabled}
                type="button"
                title="Remove pattern"
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}
          {forbidden.length === 0 && (
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic' }}>None detected</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input
            style={{ ...inputStyle, opacity: inputDisabled ? 0.4 : 1 }}
            placeholder="Add pattern..."
            value={forbiddenInput}
            onChange={(e) => setForbiddenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !inputDisabled && handleAddForbidden()}
            disabled={inputDisabled}
          />
          <button
            style={addBtnStyle}
            onClick={() => !inputDisabled && handleAddForbidden()}
            disabled={inputDisabled}
            type="button"
            title="Add forbidden pattern"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* Section: Vocabulary */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>Vocabulary</span>
          {proBadge}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {vocabulary.map((v) => (
            <div
              key={v.pattern}
              style={{
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-secondary)',
                padding: '2px 4px',
              }}
            >
              {v.pattern}
            </div>
          ))}
          {vocabulary.length === 0 && (
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic' }}>None detected</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input
            style={{ ...inputStyle, opacity: inputDisabled ? 0.4 : 1 }}
            placeholder="Add word..."
            value={vocabInput}
            onChange={(e) => setVocabInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !inputDisabled && handleAddVocab()}
            disabled={inputDisabled}
          />
          <button
            style={addBtnStyle}
            onClick={() => !inputDisabled && handleAddVocab()}
            disabled={inputDisabled}
            type="button"
            title="Add vocabulary word"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* Section: Rhythm */}
      <div style={{ marginBottom: '12px' }}>
        <span style={labelStyle}>Rhythm</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span
            style={{
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--character-badge-bg)',
              color: 'var(--character-badge-text)',
              textTransform: 'uppercase',
            }}
          >
            {rhythm?.length_bucket ?? 'moderate'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {(rhythm?.patterns ?? []).map((p) => (
            <div
              key={p.pattern}
              style={{
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-secondary)',
                padding: '2px 4px',
              }}
            >
              {p.pattern}
            </div>
          ))}
          {(rhythm?.patterns ?? []).length === 0 && (
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No patterns detected</span>
          )}
        </div>
      </div>

      {/* Section: Registers */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>Registers</span>
          {proBadge}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '9px',
                fontFamily: "'Inter', sans-serif",
                color: 'var(--text-dim)',
                marginBottom: '3px',
              }}
            >
              Formality
            </div>
            <select
              style={{
                width: '100%',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '4px 6px',
                borderRadius: '3px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none',
                opacity: inputDisabled ? 0.4 : 1,
                cursor: inputDisabled ? 'default' : 'pointer',
              }}
              value={formality}
              onChange={(e) => !inputDisabled && handleFormalityChange(e.target.value)}
              disabled={inputDisabled}
            >
              <option value="street">Street</option>
              <option value="casual">Casual</option>
              <option value="neutral">Neutral</option>
              <option value="formal">Formal</option>
              <option value="ornate">Ornate</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '9px',
                fontFamily: "'Inter', sans-serif",
                color: 'var(--text-dim)',
                marginBottom: '3px',
              }}
            >
              Profanity
            </div>
            <select
              style={{
                width: '100%',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '4px 6px',
                borderRadius: '3px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none',
                opacity: inputDisabled ? 0.4 : 1,
                cursor: inputDisabled ? 'default' : 'pointer',
              }}
              value={profanity}
              onChange={(e) => !inputDisabled && handleProfanityChange(e.target.value)}
              disabled={inputDisabled}
            >
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="heavy">Heavy</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section: Voice Notes */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>Voice Notes</span>
          {proBadge}
        </div>
        <textarea
          style={{
            width: '100%',
            minHeight: '60px',
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            padding: '8px',
            borderRadius: '3px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            opacity: inputDisabled ? 0.4 : 1,
          }}
          placeholder={`${characterName} gets softer in Act 3...`}
          value={voiceNotes}
          onChange={(e) => !inputDisabled && handleVoiceNotesChange(e.target.value)}
          disabled={inputDisabled}
        />
      </div>
    </div>
  )
}

/** Type helper — not exported, just for internal readability */
function getOverrideDefaults() {
  return {
    addedForbidden: [] as string[],
    removedForbidden: [] as string[],
    addedVocabulary: [] as string[],
    formality: undefined as 'street' | 'casual' | 'neutral' | 'formal' | 'ornate' | undefined,
    profanity: undefined as 'none' | 'mild' | 'moderate' | 'heavy' | undefined,
    voiceNotes: undefined as string | undefined,
    source: 'manual' as const,
  }
}
