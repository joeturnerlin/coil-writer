import { create } from 'zustand'
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
  recordUsage: (model: string, usage: TokenUsage | undefined) => void
  setNetworkError: (failed: boolean) => void
}

/** Session-only (not persisted): token usage and connectivity for AI calls, fed by every AI path. */
export const useAIActivityStore = create<AIActivityState>()((set) => ({
  lastCall: null,
  sessionInput: 0,
  sessionOutput: 0,
  sessionCostUSD: 0,
  unpricedCalls: 0,
  networkError: false,
  recordUsage: (model, usage) => {
    if (!usage) return
    const costUSD = estimateCostUSD(model, usage.inputTokens, usage.outputTokens)
    set((s) => ({
      lastCall: { ...usage, model, costUSD },
      sessionInput: s.sessionInput + usage.inputTokens,
      sessionOutput: s.sessionOutput + usage.outputTokens,
      sessionCostUSD: s.sessionCostUSD + (costUSD ?? 0),
      unpricedCalls: s.unpricedCalls + (costUSD === null ? 1 : 0),
    }))
  },
  setNetworkError: (networkError) => set({ networkError }),
}))

export const recordUsage = (model: string, usage: TokenUsage | undefined) =>
  useAIActivityStore.getState().recordUsage(model, usage)
