import { EditorView } from '@codemirror/view'

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
    maxWidth: '680px',
    margin: '0 auto',
    padding: '40px 20px 60px',
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
    paddingBottom: '4px',
  },
  '.fountain-character': {
    paddingLeft: '250px',
    textTransform: 'uppercase',
  },
  '.fountain-parenthetical': {
    paddingLeft: '182px',
    paddingRight: '216px',
    fontStyle: 'italic',
  },
  '.fountain-dialogue': {
    paddingLeft: '114px',
    paddingRight: '170px',
  },
  '.fountain-transition': {
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  '.fountain-episode-boundary': {
    paddingBottom: '24px',
    borderBottom: '1px solid var(--border-color)',
    fontFamily: "'Orbitron', monospace",
    fontSize: '10px',
    letterSpacing: '3px',
    textTransform: 'uppercase',
  },
  '.fountain-killbox-section': {
    paddingBottom: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
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
    paddingTop: '12px',
  },
  '.fountain-scene-heading.fountain-block-start': {
    paddingTop: '24px',
  },
  '.fountain-character.fountain-block-start': {
    paddingTop: '16px',
  },
  '.fountain-episode-boundary.fountain-block-start': {
    paddingTop: '40px',
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
    paddingTop: '16px',
    paddingBottom: '0',
    fontWeight: 'bold',
  },
  '.fountain-title-page-value': {
    paddingTop: '2px',
    paddingBottom: '20px',
  },
  '.fountain-dual-character': {
    paddingLeft: '380px',
    textTransform: 'uppercase',
    paddingTop: '0',
    marginTop: '-3.2em',
  },
  '.fountain-dual-dialogue': {
    paddingLeft: '360px',
    paddingRight: '10px',
    marginTop: '-1.6em',
  },
  '.fountain-lyric': {
    paddingLeft: '114px',
    paddingRight: '170px',
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
