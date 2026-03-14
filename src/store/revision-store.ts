import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RevisionType = 'ai-rewrite' | 'manual-edit' | 'manual-delete' | 'manual-insert'

export interface Revision {
  id: string
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
  addRevision: (rev: Omit<Revision, 'id' | 'timestamp' | 'revisionPass'>) => void
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
          id,
          timestamp: new Date().toISOString(),
          revisionPass: get().currentPass,
        }
        set((s) => ({ revisions: [...s.revisions, entry] }))
      },

      toggleRevisionMode: () => set((s) => ({ revisionMode: !s.revisionMode })),

      startNewPass: () => set((s) => ({ currentPass: s.currentPass + 1 })),

      clearRevisions: () => set({ revisions: [], currentPass: 1 }),

      removeRevision: (id) =>
        set((s) => ({ revisions: s.revisions.filter((r) => r.id !== id) })),
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
