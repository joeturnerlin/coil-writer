import type { EditorView } from '@codemirror/view'
import type { MutableRefObject } from 'react'
import { create } from 'zustand'
import type { DocumentStats, Episode } from '../editor/types'
import type { ConversionWarning } from '../lib/converters/types'

interface EditorState {
  fileName: string | null
  content: string | null
  stats: DocumentStats | null
  episodes: Episode[]
  cursorLine: number
  viewRef: MutableRefObject<EditorView | null> | null
  importWarnings: ConversionWarning[]
  importFormat: string | null

  openFile: (name: string, content: string) => void
  setStats: (stats: DocumentStats) => void
  setCursorLine: (line: number) => void
  setViewRef: (ref: MutableRefObject<EditorView | null>) => void
  updateContent: (content: string) => void
  setImportWarnings: (warnings: ConversionWarning[], format: string) => void
  clearImportWarnings: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  fileName: null,
  content: null,
  stats: null,
  episodes: [],
  cursorLine: 1,
  viewRef: null,
  importWarnings: [],
  importFormat: null,

  openFile: (name, content) =>
    set({
      fileName: name,
      content,
      cursorLine: 1,
    }),

  setStats: (stats) => set({ stats }),
  setCursorLine: (line) => set({ cursorLine: line }),
  setViewRef: (ref) => set({ viewRef: ref }),
  updateContent: (content) => set({ content }),
  setImportWarnings: (warnings, format) => set({ importWarnings: warnings, importFormat: format }),
  clearImportWarnings: () => set({ importWarnings: [], importFormat: null }),
}))
