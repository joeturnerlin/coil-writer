import type { EditorView } from '@codemirror/view'
import type { MutableRefObject } from 'react'
import { create } from 'zustand'
import type { DocumentStats, Episode } from '../editor/types'
import type { ConversionWarning } from '../lib/converters/types'
import { claimRecoveredId, clearRecoveredHint, newDocumentId } from '../lib/persistence'

export type SaveStatus = 'saved' | 'saving' | 'failed'

interface EditorState {
  documentVersion: number
  desktopDocumentId: string | null
  /** Stable identity (uuid) of the open document; the key for documents, versions, revisions. */
  documentId: string | null
  /** Desktop only: hash of the open file's real path (never the path itself); stored with the document. */
  fileKey: string | null
  /** Autosave acknowledgement for the UI: 'saved' only after the Dexie transaction committed. */
  saveStatus: SaveStatus
  lastSavedAt: number | null
  saveError: string | null
  fileName: string | null
  content: string | null
  stats: DocumentStats | null
  episodes: Episode[]
  cursorLine: number
  viewRef: MutableRefObject<EditorView | null> | null
  importWarnings: ConversionWarning[]
  importFormat: string | null

  /** documentId: pass the recovered/known id to keep identity; omitted = a new document. */
  openFile: (name: string, content: string, desktopDocumentId?: string, documentId?: string, fileKey?: string) => void
  setSaveStatus: (status: SaveStatus, error?: string | null) => void
  setStats: (stats: DocumentStats) => void
  setCursorLine: (line: number) => void
  setViewRef: (ref: MutableRefObject<EditorView | null>) => void
  updateContent: (content: string) => void
  setImportWarnings: (warnings: ConversionWarning[], format: string) => void
  clearImportWarnings: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  documentVersion: 0,
  desktopDocumentId: null,
  documentId: null,
  fileKey: null,
  saveStatus: 'saved',
  lastSavedAt: null,
  saveError: null,
  fileName: null,
  content: null,
  stats: null,
  episodes: [],
  cursorLine: 1,
  viewRef: null,
  importWarnings: [],
  importFormat: null,

  openFile: (name, content, desktopDocumentId, documentId, fileKey) => {
    // An explicit id means the caller resolved identity; the recovered hint must not be claimed by a later open of the same text.
    if (documentId) clearRecoveredHint()
    set((state) => ({
      documentVersion: state.documentVersion + 1,
      desktopDocumentId: desktopDocumentId ?? null,
      documentId: documentId ?? claimRecoveredId(name, content) ?? newDocumentId(),
      fileKey: fileKey ?? null,
      saveStatus: 'saved',
      saveError: null,
      fileName: name,
      content,
      cursorLine: 1,
      importWarnings: [],
      importFormat: null,
    }))
  },

  setSaveStatus: (status, error = null) =>
    set((state) => ({
      saveStatus: status,
      saveError: status === 'failed' ? error : null,
      lastSavedAt: status === 'saved' ? Date.now() : state.lastSavedAt,
    })),
  setStats: (stats) => set({ stats }),
  setCursorLine: (line) => set({ cursorLine: line }),
  setViewRef: (ref) => set({ viewRef: ref }),
  updateContent: (content) => set({ content }),
  setImportWarnings: (warnings, format) => set({ importWarnings: warnings, importFormat: format }),
  clearImportWarnings: () => set({ importWarnings: [], importFormat: null }),
}))
