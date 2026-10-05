import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEditorStore } from './editor-store'

export type RevisionType = 'ai-rewrite' | 'manual-edit' | 'manual-delete' | 'manual-insert'

export interface Revision {
  id: string
  /** Document this revision belongs to; absent only on rows saved before documentId existed. */
  documentId?: string
  /** Absolute character offset at time of change */
  from: number
  to: number
  /** Text before the change */
  originalText: string
  /** Text after the change */
  newText: string
  type: RevisionType
  /** ISO timestamp */
  timestamp: string
  /** Which revision pass this belongs to (1 = first draft, 2 = blue, etc.) */
  revisionPass: number
  /** Line number in the document (1-based) for display */
  lineNumber: number
}

/** Standard production revision colors */
export const REVISION_COLORS = [
  { pass: 1, name: 'White', color: '#ffffff' },
  { pass: 2, name: 'Blue', color: '#4fc3f7' },
  { pass: 3, name: 'Pink', color: '#f48fb1' },
  { pass: 4, name: 'Yellow', color: '#fff176' },
  { pass: 5, name: 'Green', color: '#81c784' },
  { pass: 6, name: 'Goldenrod', color: '#ffd54f' },
  { pass: 7, name: 'Buff', color: '#ffe0b2' },
  { pass: 8, name: 'Salmon', color: '#ef9a9a' },
]

interface RevisionState {
  revisions: Revision[]
  /** Whether manual edits are being tracked */
  revisionMode: boolean
  /** Current revision pass number */
  currentPass: number

  // Actions
  addRevision: (rev: Omit<Revision, 'id' | 'timestamp' | 'revisionPass' | 'documentId'>) => void
  /** Revisions of one document (legacy un-owned rows are adopted by the first document opened). */
  revisionsFor: (documentId: string | null) => Revision[]
  adoptLegacyRevisions: (documentId: string) => void
  toggleRevisionMode: () => void
  startNewPass: () => void
  clearRevisions: () => void
  removeRevision: (id: string) => void
}

export const useRevisionStore = create<RevisionState>()(
  persist(
    (set, get) => ({
      revisions: [],
      revisionMode: false,
      currentPass: 1,

      addRevision: (rev) => {
        const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const entry: Revision = {
          ...rev,
          documentId: useEditorStore.getState().documentId ?? undefined,
          id,
          timestamp: new Date().toISOString(),
          revisionPass: get().currentPass,
        }
        set((s) => ({ revisions: [...s.revisions, entry] }))
      },

      toggleRevisionMode: () => set((s) => ({ revisionMode: !s.revisionMode })),

      startNewPass: () => set((s) => ({ currentPass: s.currentPass + 1 })),

      revisionsFor: (documentId) => get().revisions.filter((r) => r.documentId === documentId),

      adoptLegacyRevisions: (documentId) =>
        set((s) =>
          s.revisions.some((r) => r.documentId === undefined)
            ? { revisions: s.revisions.map((r) => (r.documentId === undefined ? { ...r, documentId } : r)) }
            : s,
        ),

      // Clears only the open document's revisions; other documents keep theirs.
      clearRevisions: () => {
        const documentId = useEditorStore.getState().documentId
        set((s) => ({
          revisions: documentId ? s.revisions.filter((r) => r.documentId !== documentId) : [],
          currentPass: 1,
        }))
      },

      removeRevision: (id) => set((s) => ({ revisions: s.revisions.filter((r) => r.id !== id) })),
    }),
    {
      name: 'coil-revisions',
      partialize: (state) => ({
        revisions: state.revisions,
        revisionMode: state.revisionMode,
        currentPass: state.currentPass,
      }),
    },
  ),
)

// Rows saved before documentId existed belong to the first document opened after the upgrade.
useEditorStore.subscribe((state, prev) => {
  if (state.documentId && state.documentId !== prev.documentId) {
    useRevisionStore.getState().adoptLegacyRevisions(state.documentId)
  }
})
