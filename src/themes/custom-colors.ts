/**
 * Custom colors — pure color math + derivation.
 *
 * The user picks three colors (background, text, accent). Everything else is
 * derived from them using the same CSS variable names as presets.ts, layered
 * over the nearest base preset (Dark or Light) so spacing, status colors and
 * every variable a component reads still exist.
 */

import type { PresetId, ThemePreset } from './presets'
import { PRESETS, PRESET_LIST } from './presets'

export interface CustomColors {
  bg: string
  text: string
  accent: string
}

export type CustomSlotId = 'custom1' | 'custom2'
/** 'draft' = live, unsaved custom colors being edited. */
export type ThemeId = PresetId | CustomSlotId | 'draft'

export interface CustomSlot extends CustomColors {
  name: string
}

export type CustomSlots = Record<CustomSlotId, CustomSlot | null>

export const EMPTY_SLOTS: CustomSlots = { custom1: null, custom2: null }
export const SLOT_IDS: CustomSlotId[] = ['custom1', 'custom2']
export const SLOT_NAMES: Record<CustomSlotId, string> = { custom1: 'Custom 1', custom2: 'Custom 2' }

/** Below this ratio a color scheme cannot be saved. */
export const CONTRAST_BLOCK = 3
/** Below this ratio the UI warns. */
export const CONTRAST_WARN = 4.5

// ─── Color math ────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function isHex(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s)
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** h 0–360, s and l 0–1. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export function hexToHsl(hex: string): [number, number, number] {
  return rgbToHsl(...hexToRgb(hex))
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)))
}

/** WCAG relative luminance, 0–1. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Linear blend: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** True when white text would read better on this color than black. */
export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.179
}

/**
 * Nudge `fg` lightness (keeping hue and saturation) away from `bg` until the
 * contrast ratio reaches `min`. Returns `fg` untouched when already enough.
 */
export function nudgeForContrast(fg: string, bg: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg
  const [h, s, l] = hexToHsl(fg)
  const dir = isDarkColor(bg) ? 1 : -1
  for (let i = 1; i <= 100; i++) {
    const cand = hslToHex(h, s, l + dir * (i / 100))
    if (contrastRatio(cand, bg) >= min) return cand
  }
  return dir === 1 ? '#ffffff' : '#000000'
}

/** Shift HSL lightness by `delta` (−1…1). */
function shade(hex: string, delta: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, l + delta)
}

// ─── Derivation ────────────────────────────────────────────────────

export function deriveCustomPreset(c: CustomColors): Pick<ThemePreset, 'isDark' | 'vars'> {
  const isDark = isDarkColor(c.bg)
  const base = (isDark ? PRESETS.recoil : PRESETS.light).vars
  // Dark: every surface steps lighter. Light: panel steps lighter, the rest darker.
  const up = isDark ? 1 : -1
  const bg2 = shade(c.bg, 0.035)
  const bg3 = shade(c.bg, up * 0.06)
  const bgHover = shade(c.bg, up * 0.11)
  const border = shade(c.bg, up * 0.1)
  const borderLight = shade(c.bg, up * 0.16)

  const textSecondary = mix(c.text, c.bg, 0.25)
  const textMuted = mix(c.text, c.bg, 0.45)
  const textDim = mix(c.text, c.bg, 0.65)
  const quiet = mix(c.text, c.bg, 0.5)

  const accent = c.accent
  // Scene headings: dark base keeps its orange when readable, else nudged; light base is plain text.
  const sceneHeading = isDark ? nudgeForContrast(base['--color-scene-heading'], c.bg, CONTRAST_WARN) : c.text
  const lyric = isDark ? nudgeForContrast(base['--color-lyric'], c.bg, CONTRAST_WARN) : c.text

  const vars: Record<string, string> = {
    ...base,
    '--bg-primary': c.bg,
    '--bg-secondary': bg2,
    '--bg-tertiary': bg3,
    '--bg-hover': bgHover,
    '--border-color': border,
    '--border-light': borderLight,
    '--text-primary': c.text,
    '--text-secondary': textSecondary,
    '--text-muted': textMuted,
    '--text-dim': textDim,
    '--accent-cyan': accent,
    '--accent-cyan-dim': rgba(accent, 0.1),
    '--selection-bg': rgba(accent, 0.3),
    '--selection-bg-focused': rgba(accent, 0.3),
    '--caret-color': accent,

    '--color-scene-heading': sceneHeading,
    '--color-character': isDark ? accent : c.text,
    '--color-parenthetical': quiet,
    '--color-dialogue': c.text,
    '--color-transition': quiet,
    '--color-action': c.text,
    '--color-episode': accent,
    '--color-killbox': mix(c.text, c.bg, 0.7),
    '--color-note': quiet,
    '--color-centered': textSecondary,
    '--color-lyric': lyric,
    '--color-title-key': c.text,
    '--color-title-value': textSecondary,

    '--hero-title-glow': isDark ? `0 0 40px ${rgba(accent, 0.15)}` : 'none',
    '--hero-stat-color': accent,
    '--hero-stat-glow': `0 0 20px ${rgba(accent, 0.3)}`,
    '--hero-bg-glow': `radial-gradient(ellipse 60% 80% at 50% 20%, ${rgba(accent, 0.05)}, transparent 70%)`,

    '--toolbar-bg': isDark ? c.bg : bg3,
    '--toolbar-border': border,
    '--mode-analyze-bg': rgba(accent, 0.12),
    '--mode-analyze-text': accent,
    '--mode-analyze-border': accent,
    '--subtext-dot': accent,
    '--subtext-underline': rgba(accent, 0.3),
    '--stash-tab-bg': bg3,
    '--stash-tab-border': border,
    '--stash-handle-color': textDim,
    '--transport-bg': bg2,
    '--transport-border': border,
    '--transport-pause': accent,
    '--character-badge-bg': bgHover,
    '--character-badge-text': quiet,
    '--character-expand-bg': bg3,
    '--onboarding-card-bg': bg2,
    '--onboarding-card-border': accent,
  }
  return { isDark, vars }
}

// ─── Active theme resolution ───────────────────────────────────────

function colorsOfPreset(id: PresetId): CustomColors {
  const v = (PRESETS[id] ?? PRESETS.recoil).vars
  return { bg: v['--bg-primary'], text: v['--text-primary'], accent: v['--accent-cyan'] }
}

/** The three colors the editor controls should show for the active theme. */
export function activeColors(id: ThemeId, draft: CustomColors | null, slots: CustomSlots): CustomColors {
  if (id === 'draft') return draft ?? colorsOfPreset('recoil')
  if (id === 'custom1' || id === 'custom2') {
    const s = slots[id]
    return s ? { bg: s.bg, text: s.text, accent: s.accent } : (draft ?? colorsOfPreset('recoil'))
  }
  return colorsOfPreset(id)
}

/** Resolve any theme id to applicable vars. Unknown or empty slots fall back to Dark. */
export function resolveTheme(
  id: ThemeId,
  draft: CustomColors | null,
  slots: CustomSlots,
): Pick<ThemePreset, 'isDark' | 'vars'> {
  if (id === 'draft') return draft ? deriveCustomPreset(draft) : PRESETS.recoil
  if (id === 'custom1' || id === 'custom2') {
    const s = slots[id]
    return s ? deriveCustomPreset(s) : PRESETS.recoil
  }
  return PRESETS[id] ?? PRESETS.recoil
}

/** Cycle order Dark → Muted → Light → Custom 1 → Custom 2, skipping empty slots. */
export function cycleOrder(slots: CustomSlots): ThemeId[] {
  return [...PRESET_LIST.map((p) => p.id), ...SLOT_IDS.filter((s) => slots[s] !== null)]
}

export function nextThemeId(current: ThemeId, slots: CustomSlots): ThemeId {
  const order = cycleOrder(slots)
  const idx = order.indexOf(current)
  return idx === -1 ? order[0] : order[(idx + 1) % order.length]
}

/** Toolbar label for a theme id. */
export function themeName(id: ThemeId, slots: CustomSlots): string {
  if (id === 'draft') return 'Custom*'
  if (id === 'custom1' || id === 'custom2') return slots[id]?.name ?? SLOT_NAMES[id]
  return PRESETS[id]?.name ?? 'Dark'
}
