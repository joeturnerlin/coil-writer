import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { runProofreadInApp } from '../lib/proofread'
import type { ProofreadResult } from '../lib/proofread-core'
import { useEditorStore } from './editor-store'

type Status = 'idle' | 'running' | 'done' | 'error'

interface ProofreadState {
  status: Status
  progress: { done: number; total: number }
  error: string | null
  /** document the current result belongs to */
  resultDocId: string | null
  result: ProofreadResult | null
  /** documentId -> dismissed finding ids (persisted) */
  dismissed: Record<string, string[]>
  run: () => Promise<void>
  cancel: () => void
  dismiss: (documentId: string, findingId: string) => void
}

let controller: AbortController | null = null

export const useProofreadStore = create<ProofreadState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      progress: { done: 0, total: 0 },
      error: null,
      resultDocId: null,
      result: null,
      dismissed: {},

      run: async () => {
        if (get().status === 'running') return
        const { content, documentId } = useEditorStore.getState()
        if (!content?.trim()) return
        controller = new AbortController()
        const mine = controller
        set({ status: 'running', error: null, progress: { done: 0, total: 0 } })
        try {
          const result = await runProofreadInApp(content, mine.signal, (done, total) =>
            set({ progress: { done, total } }),
          )
          if (result.chunks > 0 && result.failedChunks === result.chunks) {
            set({ status: 'error', error: result.firstError ?? 'Proofread failed.', result: null })
          } else {
            set({ status: 'done', result, resultDocId: documentId })
          }
        } catch (err) {
          if (mine.signal.aborted) set({ status: 'idle' })
          else set({ status: 'error', error: err instanceof Error ? err.message : 'Proofread failed.' })
        }
      },
      cancel: () => controller?.abort(),
      dismiss: (documentId, findingId) =>
        set((s) => ({
          dismissed: { ...s.dismissed, [documentId]: [...new Set([...(s.dismissed[documentId] ?? []), findingId])] },
        })),
    }),
    { name: 'coil-proofread-v1', partialize: (s) => ({ dismissed: s.dismissed }) },
  ),
)
