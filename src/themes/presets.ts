/**
 * Theme Presets — Single Source of Truth
 *
 * All visual theming flows through this file.
 * Colors match the recoil.studio/labs design system.
 *
 * Three presets:
 *   recoil  — Labs dark. Cyan accents, orange headings, deep void black. (Default)
 *   muted   — Warm dark. Amber accents, same shapes, softer palette.
 *   light   — Light mode. Blue accents, off-white, same shapes.
 */

export type PresetId = 'recoil' | 'muted' | 'light'

export interface ThemePreset {
  id: PresetId
  name: string
  isDark: boolean
  /** CSS custom properties applied to :root */
  vars: Record<string, string>
}

// ─── Recoil (Default) ──────────────────────────────────────────────
// Labs dark — cyan accents, orange scene headings, deep void black.

const recoil: ThemePreset = {
  id: 'recoil',
  name: 'Dark',
  isDark: true,
  vars: {
    // Backgrounds
    '--bg-primary': '#0a0a0f',
    '--bg-secondary': '#12121a',
    '--bg-tertiary': '#1a1a24',
    '--bg-hover': '#22222e',
    // Borders
    '--border-color': '#1e1e2e',
    '--border-light': '#2a2a3a',
    // Text
    '--text-primary': '#e0e4ec',
    '--text-secondary': '#a0a8b8',
    '--text-muted': '#5a6478',
    '--text-dim': '#3a4050',
    // Accent: green (edit mode)
    '--accent-green': '#0d2818',
    '--accent-green-hover': '#1a4028',
    '--accent-green-text': '#4ade80',
    // Accent: blue (annotate mode)
    '--accent-blue': '#0c2d48',
    '--accent-blue-hover': '#143d5c',
    '--accent-blue-text': '#60a5fa',
    // Accent: cyan (brand, active elements)
    '--accent-cyan': '#00f0ff',
    '--accent-cyan-dim': 'rgba(0, 240, 255, 0.08)',
    // Selection / caret
    '--selection-bg': 'rgba(0, 240, 255, 0.25)',
    '--selection-bg-focused': 'rgba(0, 240, 255, 0.25)',
    '--caret-color': '#00f0ff',

    // ── Screenplay Element Colors ──
    '--color-scene-heading': '#e8a040',
    '--color-character': '#00f0ff',
    '--color-parenthetical': '#5a6478',
    '--color-dialogue': '#e0e4ec',
    '--color-transition': '#5a6478',
    '--color-action': '#e0e4ec',
    '--color-episode': '#00f0ff',
    '--color-killbox': '#444444',
    '--color-note': '#5a6478',
    '--color-centered': '#a0a8b8',
    '--color-lyric': '#a78bfa',
    '--color-title-key': '#e0e4ec',
    '--color-title-value': '#a0a8b8',

    // ── Export Buttons ──
    '--export-json-bg': '#0d2818',
    '--export-json-border': '#1a4028',
    '--export-json-color': '#4ade80',
    '--export-fountain-bg': '#0c2d48',
    '--export-fountain-border': '#143d5c',
    '--export-fountain-color': '#60a5fa',

    // ── Spacing ──
    '--card-padding': '16px',
    '--card-margin-x': '12px',
    '--card-margin-b': '12px',
    '--card-radius': '6px',
    '--btn-radius': '4px',
    '--panel-annotation-width': '340px',

    // ── Hero Section ──
    '--hero-title-size': '36px',
    '--hero-title-spacing': '12px',
    '--hero-title-glow': '0 0 40px rgba(0, 240, 255, 0.15)',
    '--hero-stat-color': '#00f0ff',
    '--hero-stat-glow': '0 0 20px rgba(0, 240, 255, 0.3)',
    '--hero-bg-glow': 'radial-gradient(ellipse 60% 80% at 50% 20%, rgba(0,240,255,0.06), transparent 70%)',

    // ── Toolbar ──
    '--toolbar-bg': '#0a0a0f',
    '--toolbar-border': '#1e1e2e',
  },
}

// ─── Muted ─────────────────────────────────────────────────────────
// Warm dark — amber/gold accents, same shapes, softer contrast.

const muted: ThemePreset = {
  id: 'muted',
  name: 'Muted',
  isDark: true,
  vars: {
    // Backgrounds — warm charcoal
    '--bg-primary': '#181716',
    '--bg-secondary': '#1f1e1c',
    '--bg-tertiary': '#272523',
    '--bg-hover': '#342f2b',
    // Borders
    '--border-color': '#3a3530',
    '--border-light': '#4a453f',
    // Text — warm whites
    '--text-primary': '#ddd8d0',
    '--text-secondary': '#a8a098',
    '--text-muted': '#7a736b',
    '--text-dim': '#5a544e',
    // Accent: green
    '--accent-green': '#2d5a27',
    '--accent-green-hover': '#3d7a37',
    '--accent-green-text': '#81c784',
    // Accent: blue
    '--accent-blue': '#37474f',
    '--accent-blue-hover': '#455a64',
    '--accent-blue-text': '#90a4ae',
    // Accent: cyan → amber/gold for muted
    '--accent-cyan': '#d4a574',
    '--accent-cyan-dim': 'rgba(212, 165, 116, 0.1)',
    // Selection / caret
    '--selection-bg': 'rgba(212, 165, 116, 0.35)',
    '--selection-bg-focused': 'rgba(212, 165, 116, 0.35)',
    '--caret-color': '#d4a574',

    // ── Screenplay Element Colors ──
    '--color-scene-heading': '#c49050',
    '--color-character': '#d4a574',
    '--color-parenthetical': '#7a736b',
    '--color-dialogue': '#ddd8d0',
    '--color-transition': '#7a736b',
    '--color-action': '#ddd8d0',
    '--color-episode': '#d4a574',
    '--color-killbox': '#504840',
    '--color-note': '#7a736b',
    '--color-centered': '#a8a098',
    '--color-lyric': '#b39ddb',
    '--color-title-key': '#a8a098',
    '--color-title-value': '#7a736b',

    // ── Export Buttons ──
    '--export-json-bg': 'transparent',
    '--export-json-border': '#81c784',
    '--export-json-color': '#81c784',
    '--export-fountain-bg': 'transparent',
    '--export-fountain-border': '#90a4ae',
    '--export-fountain-color': '#90a4ae',

    // ── Spacing ──
    '--card-padding': '16px',
    '--card-margin-x': '12px',
    '--card-margin-b': '12px',
    '--card-radius': '6px',
    '--btn-radius': '4px',
    '--panel-annotation-width': '340px',

    // ── Hero Section ──
    '--hero-title-size': '36px',
    '--hero-title-spacing': '12px',
    '--hero-title-glow': '0 0 40px rgba(212, 165, 116, 0.15)',
    '--hero-stat-color': '#d4a574',
    '--hero-stat-glow': '0 0 20px rgba(212, 165, 116, 0.3)',
    '--hero-bg-glow': 'radial-gradient(ellipse 60% 80% at 50% 20%, rgba(212,165,116,0.04), transparent 70%)',

    // ── Toolbar ──
    '--toolbar-bg': '#1f1e1c',
    '--toolbar-border': '#2a2825',
  },
}

// ─── Light ─────────────────────────────────────────────────────────
// Clean light mode — same shapes, off-white + black palette.

const light: ThemePreset = {
  id: 'light',
  name: 'Light',
  isDark: false,
  vars: {
    // Backgrounds
    '--bg-primary': '#faf9f7',
    '--bg-secondary': '#ffffff',
    '--bg-tertiary': '#f0eeeb',
    '--bg-hover': '#e5e2de',
    // Borders
    '--border-color': '#d5d0ca',
    '--border-light': '#c5c0ba',
    // Text
    '--text-primary': '#1a1a1a',
    '--text-secondary': '#4a4540',
    '--text-muted': '#8a857f',
    '--text-dim': '#b0aaa3',
    // Accent: green
    '--accent-green': '#e8f5e9',
    '--accent-green-hover': '#c8e6c9',
    '--accent-green-text': '#2e7d32',
    // Accent: blue
    '--accent-blue': '#e3f2fd',
    '--accent-blue-hover': '#bbdefb',
    '--accent-blue-text': '#1565c0',
    // Accent: cyan
    '--accent-cyan': '#0277bd',
    '--accent-cyan-dim': 'rgba(2, 119, 189, 0.08)',
    // Selection / caret
    '--selection-bg': 'rgba(21, 101, 192, 0.3)',
    '--selection-bg-focused': 'rgba(21, 101, 192, 0.3)',
    '--caret-color': '#0277bd',

    // ── Screenplay Element Colors ──
    // Light mode: all screenplay text is black, only metadata keeps color
    '--color-scene-heading': '#1a1a1a',
    '--color-character': '#1a1a1a',
    '--color-parenthetical': '#1a1a1a',
    '--color-dialogue': '#1a1a1a',
    '--color-transition': '#1a1a1a',
    '--color-action': '#1a1a1a',
    '--color-episode': '#0277bd',
    '--color-killbox': '#4a5568',
    '--color-note': '#8a857f',
    '--color-centered': '#1a1a1a',
    '--color-lyric': '#1a1a1a',
    '--color-title-key': '#1a1a1a',
    '--color-title-value': '#1a1a1a',

    // ── Export Buttons ──
    '--export-json-bg': '#2e7d32',
    '--export-json-border': '#388e3c',
    '--export-json-color': '#fff',
    '--export-fountain-bg': '#1565c0',
    '--export-fountain-border': '#1976d2',
    '--export-fountain-color': '#fff',

    // ── Spacing ──
    '--card-padding': '16px',
    '--card-margin-x': '12px',
    '--card-margin-b': '12px',
    '--card-radius': '6px',
    '--btn-radius': '4px',
    '--panel-annotation-width': '340px',

    // ── Hero Section ──
    '--hero-title-size': '32px',
    '--hero-title-spacing': '10px',
    '--hero-title-glow': 'none',
    '--hero-stat-color': '#0277bd',
    '--hero-stat-glow': '0 0 12px rgba(2, 119, 189, 0.2)',
    '--hero-bg-glow': 'radial-gradient(ellipse 60% 80% at 50% 20%, rgba(2,119,189,0.04), transparent 70%)',

    // ── Toolbar ──
    '--toolbar-bg': '#f0eeeb',
    '--toolbar-border': '#d5d0ca',
  },
}

// ─── Registry ──────────────────────────────────────────────────────

export const PRESETS: Record<PresetId, ThemePreset> = { recoil, muted, light }

export const PRESET_LIST: ThemePreset[] = [recoil, muted, light]

export function getPreset(id: PresetId): ThemePreset {
  return PRESETS[id] ?? recoil
}

/**
 * Apply a preset to the document. Sets CSS variables on :root,
 * updates body class (dark/light), and sets body bg/color.
 */
export function applyPreset(preset: ThemePreset) {
  const root = document.documentElement

  // Set all CSS variables
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(key, value)
  }

  // Set body class for scrollbar/CM6 panel styling
  document.body.className = preset.isDark ? 'dark' : 'light'
  document.body.style.background = preset.vars['--bg-primary']
  document.body.style.color = preset.vars['--text-primary']
}
