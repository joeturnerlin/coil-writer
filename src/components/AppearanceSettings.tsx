import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settings-store'
import type { CustomColors, CustomSlotId } from '../themes/custom-colors'
import {
  CONTRAST_BLOCK,
  CONTRAST_WARN,
  SLOT_IDS,
  SLOT_NAMES,
  activeColors,
  contrastRatio,
  hexToHsl,
  hslToHex,
  isHex,
  nudgeForContrast,
  themeName,
} from '../themes/custom-colors'

const mono = "'JetBrains Mono', monospace"

const smallLabel: React.CSSProperties = {
  fontSize: '9px',
  fontFamily: mono,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
}

const btn: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '10px',
  fontFamily: mono,
  fontWeight: 600,
  borderRadius: 'var(--btn-radius)',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

type Channel = 'h' | 's' | 'l'

/** Slider track gradients, built from the current color so they preview what dragging does. */
function trackFor(ch: Channel, h: number, s: number, l: number): string {
  if (ch === 'h') {
    const stops = [0, 60, 120, 180, 240, 300, 360].map((d) => hslToHex(d, 1, 0.5))
    return `linear-gradient(to right, ${stops.join(', ')})`
  }
  if (ch === 's') return `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 1, l)})`
  return `linear-gradient(to right, #000000, ${hslToHex(h, s, 0.5)}, #ffffff)`
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  // Local HSL so hue/saturation survive passing through grey or black while dragging.
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(value))
  const lastEmitted = useRef(value)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setHsl(hexToHsl(value))
    }
  }, [value])
  const [hexDraft, setHexDraft] = useState(value)
  useEffect(() => setHexDraft(value), [value])

  const set = (ch: Channel, v: number) => {
    const next: [number, number, number] = [...hsl]
    next[ch === 'h' ? 0 : ch === 's' ? 1 : 2] = ch === 'h' ? v : v / 100
    setHsl(next)
    lastEmitted.current = hslToHex(next[0], next[1], next[2])
    onChange(lastEmitted.current)
  }

  const sliders: { ch: Channel; name: string; max: number; val: number }[] = [
    { ch: 'h', name: 'Hue', max: 360, val: hsl[0] },
    { ch: 's', name: 'Saturation', max: 100, val: hsl[1] * 100 },
    { ch: 'l', name: 'Lightness', max: 100, val: hsl[2] * 100 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '26px',
            height: '22px',
            padding: 0,
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--btn-radius)',
            background: 'none',
            cursor: 'pointer',
          }}
        />
        <span style={{ ...smallLabel, width: '72px', color: 'var(--text-secondary)' }}>{label}</span>
        <input
          aria-label={`${label} hex`}
          value={hexDraft}
          maxLength={7}
          onChange={(e) => {
            setHexDraft(e.target.value)
            if (isHex(e.target.value)) onChange(e.target.value.toLowerCase())
          }}
          onBlur={() => setHexDraft(value)}
          style={{
            width: '72px',
            fontSize: '11px',
            fontFamily: mono,
            padding: '3px 6px',
            borderRadius: 'var(--btn-radius)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {sliders.map((sl) => (
          <label key={sl.ch} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={smallLabel}>{sl.name}</span>
            <input
              type="range"
              aria-label={`${label} ${sl.name.toLowerCase()}`}
              min={0}
              max={sl.max}
              step={1}
              value={Math.round(sl.val)}
              onChange={(e) => set(sl.ch, Number(e.target.value))}
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '4px',
                appearance: 'none',
                WebkitAppearance: 'none',
                background: trackFor(sl.ch, hsl[0], hsl[1], hsl[2]),
                border: '1px solid var(--border-light)',
                cursor: 'pointer',
                accentColor: 'var(--accent-cyan)',
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export function AppearanceSettings() {
  const preset = useSettingsStore((s) => s.preset)
  const draft = useSettingsStore((s) => s.customDraft)
  const draftBase = useSettingsStore((s) => s.draftBase)
  const slots = useSettingsStore((s) => s.customSlots)
  const setCustomColor = useSettingsStore((s) => s.setCustomColor)
  const saveCustomSlot = useSettingsStore((s) => s.saveCustomSlot)
  const resetCustom = useSettingsStore((s) => s.resetCustom)
  const [confirmSlot, setConfirmSlot] = useState<CustomSlotId | null>(null)

  const colors: CustomColors = activeColors(preset, draft, slots)
  const ratio = contrastRatio(colors.text, colors.bg)
  const blocked = ratio < CONTRAST_BLOCK
  const warn = ratio < CONTRAST_WARN

  const onSave = (slot: CustomSlotId) => {
    if (blocked) return
    if (slots[slot] && confirmSlot !== slot) {
      setConfirmSlot(slot)
      return
    }
    saveCustomSlot(slot)
    setConfirmSlot(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ ...smallLabel, fontSize: '10px', marginBottom: 0 }}>Appearance</span>
        <span style={{ ...smallLabel, color: 'var(--text-dim)' }}>Theme: {themeName(preset, slots)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ColorRow label="Background" value={colors.bg} onChange={(hex) => setCustomColor('bg', hex)} />
        <ColorRow label="Text" value={colors.text} onChange={(hex) => setCustomColor('text', hex)} />
        <ColorRow label="Highlight" value={colors.accent} onChange={(hex) => setCustomColor('accent', hex)} />
      </div>

      {/* Contrast guard */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
          padding: '6px 10px',
          borderRadius: 'var(--btn-radius)',
          background: 'var(--bg-primary)',
          border: `1px solid ${blocked ? 'var(--continuity-warning)' : 'var(--border-color)'}`,
        }}
      >
        <span style={{ fontFamily: mono, fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {ratio.toFixed(1)}:1
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '10px',
            fontFamily: "'Inter', sans-serif",
            color: blocked ? 'var(--continuity-warning)' : warn ? 'var(--accent-cyan)' : 'var(--text-muted)',
          }}
        >
          {blocked
            ? 'Too low to read — cannot save below 3:1.'
            : warn
              ? 'Text contrast is low. 4.5:1 or more reads comfortably.'
              : 'Text contrast is good.'}
        </span>
        {warn && (
          <button
            type="button"
            style={btn}
            onClick={() => setCustomColor('text', nudgeForContrast(colors.text, colors.bg, CONTRAST_WARN))}
          >
            Fix
          </button>
        )}
      </div>

      {/* Slots */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        {SLOT_IDS.map((slot) =>
          confirmSlot === slot ? (
            <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)' }}>
                Overwrite {SLOT_NAMES[slot]}?
              </span>
              <button type="button" style={btn} onClick={() => onSave(slot)}>
                Overwrite
              </button>
              <button type="button" style={btn} onClick={() => setConfirmSlot(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              key={slot}
              type="button"
              disabled={blocked}
              style={{ ...btn, opacity: blocked ? 0.4 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}
              onClick={() => onSave(slot)}
            >
              Save to {SLOT_NAMES[slot]}
            </button>
          ),
        )}
        <button type="button" style={{ ...btn, marginLeft: 'auto' }} onClick={() => resetCustom()}>
          Reset to {themeName(draftBase, slots)}
        </button>
      </div>
    </div>
  )
}
