import { EditorView } from '@codemirror/view'

/**
 * Zoom-scaled px helper.
 * All layout dimensions use this so zoom scales everything proportionally
 * (page width, margins, spacing) — not just font size.
 * The --zoom-scale CSS variable is set by EditorPanel's zoom effect.
 */
const zs = (px: number) => `calc(${px}px * var(--zoom-scale, 1))`

/**
 * Base theme shared by dark and light modes.
 * Sets the font family, line height, and general editor chrome.
 */
export const fountainBaseTheme = EditorView.baseTheme({
  '&': {
    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
    fontSize: '14px',
    lineHeight: '1.6',
  },
  '.cm-content': {
    maxWidth: zs(680),
    margin: '0 auto',
    padding: `${zs(40)} ${zs(20)} ${zs(60)}`,
    caretColor: 'var(--caret-color)',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg-focused) !important',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-line': {
    padding: '0',
  },

  // ── Fountain element classes (applied via line decorations) ──

  '.fountain-scene-heading': {
    fontWeight: 'bold',
    textTransform: 'uppercase',
    paddingBottom: zs(4),
  },
  '.fountain-character': {
    paddingLeft: zs(250),
    textTransform: 'uppercase',
  },
  '.fountain-parenthetical': {
    paddingLeft: zs(182),
    paddingRight: zs(216),
    fontStyle: 'italic',
  },
  '.fountain-dialogue': {
    paddingLeft: zs(114),
    paddingRight: zs(170),
  },
  '.fountain-transition': {
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  '.fountain-episode-boundary': {
    paddingBottom: zs(24),
    borderBottom: '1px solid var(--border-color)',
    fontFamily: "'Orbitron', monospace",
    fontSize: zs(10),
    letterSpacing: zs(3),
    textTransform: 'uppercase',
  },
  '.fountain-killbox-section': {
    paddingBottom: zs(8),
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: zs(11),
    fontWeight: '400',
    letterSpacing: '0',
    textTransform: 'none',
  },
  '.fountain-blank': {
    lineHeight: '0.8',
    padding: '0',
  },

  // Block-start: first element after a blank line gets top spacing
  '.fountain-block-start': {
    paddingTop: zs(12),
  },
  '.fountain-scene-heading.fountain-block-start': {
    paddingTop: zs(24),
  },
  '.fountain-character.fountain-block-start': {
    paddingTop: zs(16),
  },
  '.fountain-episode-boundary.fountain-block-start': {
    paddingTop: zs(40),
  },
  '.fountain-page-break': {
    fontSize: '0',
    lineHeight: '0',
    padding: '0',
    opacity: '0',
    overflow: 'hidden',
    maxHeight: '1px',
  },
  '.fountain-boneyard': {
    opacity: '0.3',
    fontStyle: 'italic',
  },
  '.fountain-centered-text': {
    textAlign: 'center',
  },
  '.fountain-title-page-key': {
    paddingTop: zs(16),
    paddingBottom: '0',
    fontWeight: 'bold',
  },
  '.fountain-title-page-value': {
    paddingTop: zs(2),
    paddingBottom: zs(20),
  },
  '.fountain-dual-character': {
    paddingLeft: zs(380),
    textTransform: 'uppercase',
    paddingTop: '0',
    marginTop: '-3.2em',
  },
  '.fountain-dual-dialogue': {
    paddingLeft: zs(360),
    paddingRight: zs(10),
    marginTop: '-1.6em',
  },
  '.fountain-lyric': {
    paddingLeft: zs(114),
    paddingRight: zs(170),
    fontStyle: 'italic',
  },
  '.fountain-note': {
    opacity: '0.5',
    fontStyle: 'italic',
  },

  // ── Autocomplete dropdown ──
  '.cm-tooltip-autocomplete': {
    background: 'var(--bg-tertiary) !important',
    border: '1px solid var(--border-light) !important',
    borderRadius: '6px !important',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4) !important',
    fontFamily: "'Courier Prime', monospace !important",
    fontSize: '13px !important',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 12px !important',
    color: 'var(--color-character) !important',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--bg-hover) !important',
    color: 'var(--text-primary) !important',
  },
})

/** Screenplay element colors — shared between dark and light themes via CSS vars */
const screenplayColors = {
  '.fountain-scene-heading': {
    color: 'var(--color-scene-heading)',
  },
  '.fountain-character': {
    color: 'var(--color-character)',
  },
  '.fountain-parenthetical': {
    color: 'var(--color-parenthetical)',
  },
  '.fountain-dialogue': {
    color: 'var(--color-dialogue)',
  },
  '.fountain-transition': {
    color: 'var(--color-transition)',
  },
  '.fountain-action': {
    color: 'var(--color-action)',
  },
  '.fountain-episode-boundary': {
    color: 'var(--color-episode)',
    borderBottomColor: 'var(--border-color)',
  },
  '.fountain-killbox-section': {
    color: 'var(--color-killbox)',
  },
  '.fountain-boneyard': {
    color: 'var(--text-dim)',
  },
  '.fountain-dual-character': {
    color: 'var(--color-character)',
  },
  '.fountain-dual-dialogue': {
    color: 'var(--color-dialogue)',
  },
  '.fountain-centered-text': {
    color: 'var(--color-centered)',
  },
  '.fountain-lyric': {
    color: 'var(--color-lyric)',
  },
  '.fountain-title-page-key': {
    color: 'var(--color-title-key)',
  },
  '.fountain-title-page-value': {
    color: 'var(--color-title-value)',
  },
}

/**
 * Dark theme colors.
 * Colors are controlled by CSS custom properties from presets.
 */
export const fountainDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    },
    '.cm-content': {
      caretColor: 'var(--caret-color)',
    },
    ...screenplayColors,
  },
  { dark: true },
)

/**
 * Light theme colors.
 * Colors are controlled by CSS custom properties from presets.
 */
export const fountainLightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    },
    '.cm-content': {
      caretColor: 'var(--caret-color)',
    },
    ...screenplayColors,
  },
  { dark: false },
)
