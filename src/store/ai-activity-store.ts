import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { estimateCostUSD } from '../lib/models'
import type { TokenUsage } from '../lib/usage'

export interface CallUsage extends TokenUsage {
  model: string
  /** Estimated USD; null when the model has no verified price. */
  costUSD: number | null
}

interface AIActivityState {
  lastCall: CallUsage | null
  sessionInput: number
  sessionOutput: number
  /** Summed estimate over priced calls only. */
  sessionCostUSD: number
  /** Calls whose model has no verified price (tokens counted, dollars not). */
  unpricedCalls: number
  /** True when the most recent AI request failed before any response arrived. */
  networkError: boolean
  /** Running total across app restarts, until the user resets it. */
  totalInput: number
  totalOutput: number
  totalCostUSD: number
  /** Calls in the running total whose model has no verified price (dollars incomplete). */
  totalUnpricedCalls: number
  totalSince: number
  recordUsage: (model: string, usage: TokenUsage | undefined) => void
  setNetworkError: (failed: boolean) => void
  resetTotal: () => void
}

/** Token usage and connectivity for AI calls, fed by every AI path. Only the running total is persisted. */
export const useAIActivityStore = create<AIActivityState>()(
  persist(
    (set) => ({
      lastCall: null,
      sessionInput: 0,
      sessionOutput: 0,
      sessionCostUSD: 0,
      unpricedCalls: 0,
      networkError: false,
      totalInput: 0,
      totalOutput: 0,
      totalCostUSD: 0,
      totalUnpricedCalls: 0,
      totalSince: Date.now(),
      recordUsage: (model, usage) => {
        if (!usage) return
        const costUSD = estimateCostUSD(model, usage.inputTokens, usage.outputTokens)
        set((s) => ({
          lastCall: { ...usage, model, costUSD },
          sessionInput: s.sessionInput + usage.inputTokens,
          sessionOutput: s.sessionOutput + usage.outputTokens,
          sessionCostUSD: s.sessionCostUSD + (costUSD ?? 0),
          unpricedCalls: s.unpricedCalls + (costUSD === null ? 1 : 0),
          totalInput: s.totalInput + usage.inputTokens,
          totalOutput: s.totalOutput + usage.outputTokens,
          totalCostUSD: s.totalCostUSD + (costUSD ?? 0),
          totalUnpricedCalls: s.totalUnpricedCalls + (costUSD === null ? 1 : 0),
        }))
      },
      setNetworkError: (networkError) => set({ networkError }),
      resetTotal: () =>
        set({ totalInput: 0, totalOutput: 0, totalCostUSD: 0, totalUnpricedCalls: 0, totalSince: Date.now() }),
    }),
    {
      name: 'coil-ai-spend',
      // Accounting must never break an AI call: a failed write (storage full) is ignored.
      storage: createJSONStorage(() => ({
        getItem: (k: string) => {
          try {
            return localStorage.getItem(k)
          } catch {
            return null
          }
        },
        setItem: (k: string, v: string) => {
          try {
            localStorage.setItem(k, v)
          } catch {
            // storage full or unavailable
          }
        },
        removeItem: (k: string) => {
          try {
            localStorage.removeItem(k)
          } catch {
            // ignore
          }
        },
      })),
      partialize: (s) => ({
        totalInput: s.totalInput,
        totalOutput: s.totalOutput,
        totalCostUSD: s.totalCostUSD,
        totalUnpricedCalls: s.totalUnpricedCalls,
        totalSince: s.totalSince,
      }),
    },
  ),
)

export const recordUsage = (model: string, usage: TokenUsage | undefined) =>
  useAIActivityStore.getState().recordUsage(model, usage)
