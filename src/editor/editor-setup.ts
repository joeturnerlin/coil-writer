import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { annotationField } from './annotation-state'
import { characterAutocomplete } from './character-autocomplete'
import { fountainLineDecorations, fountainMarkDecorations } from './fountain-decorations'
import { fountainKeymap } from './fountain-keymap'
import { fountainLanguage } from './fountain-language'
import { fountainBaseTheme, fountainDarkTheme, fountainLightTheme } from './fountain-theme'
import type { EditorMode } from './types'

/**
 * Theme compartment — allows runtime switching between dark and light.
 * Usage: view.dispatch({ effects: themeCompartment.reconfigure(newTheme) })
 */
export const themeCompartment = new Compartment()

/**
 * Read-only compartment — allows toggling edit/analyze mode.
 */
export const readOnlyCompartment = new Compartment()

/**
 * Font size compartment — allows runtime font size changes.
 */
export const fontSizeCompartment = new Compartment()

function fontSizeTheme(size: number) {
  return EditorView.theme({
    '&': { fontSize: `${size}px` },
    '.cm-content': { fontSize: `${size}px` },
  })
}

/**
 * Creates the full set of CM6 extensions for the Fountain editor.
 *
 * @param theme - 'dark' or 'light'
 * @param mode - 'edit' or 'analyze'
 * @param onUpdate - callback fired on every document update (for stats, etc.)
 * @returns Extension array to pass to EditorState.create() or useCodeMirror()
 */
export function createEditorExtensions(
  theme: 'dark' | 'light' = 'dark',
  mode: EditorMode = 'edit',
  fontSize = 14,
  onUpdate?: (update: { doc: string; cursorLine: number; selection: { from: number; to: number } }) => void,
): Extension[] {
  const themeExtension = theme === 'dark' ? fountainDarkTheme : fountainLightTheme

  return [
    // Language
    fountainLanguage,

    // Themes
    fountainBaseTheme,
    themeCompartment.of(themeExtension),
    fontSizeCompartment.of(fontSizeTheme(fontSize)),

    // Decorations (THREE separate providers — never mix)
    fountainLineDecorations,
    fountainMarkDecorations,
    annotationField,

    // Keymaps
    keymap.of([...fountainKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),

    // Built-in extensions
    history(),
    search(),
    characterAutocomplete(),
    EditorView.lineWrapping,
    readOnlyCompartment.of(EditorState.readOnly.of(mode === 'annotate')),

    // Update listener — pushes derived data out to React/Zustand
    ...(onUpdate
      ? [
          EditorView.updateListener.of((update) => {
            // Fire on doc changes, selection changes, or annotation state field changes
            const annotationsChanged =
              update.startState.field(annotationField, false) !== update.state.field(annotationField, false)
            if (update.docChanged || update.selectionSet || annotationsChanged) {
              const doc = update.state.doc.toString()
              const cursorLine = update.state.doc.lineAt(update.state.selection.main.head).number
              const sel = update.state.selection.main
              onUpdate({ doc, cursorLine, selection: { from: sel.from, to: sel.to } })
            }
          }),
        ]
      : []),
  ]
}
