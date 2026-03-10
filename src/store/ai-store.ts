import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, RewriteSuggestion } from '../lib/ai-provider'

interface AIState {
  // Configuration (persisted)
  provider: AIProvider
  model: string
  apiKeys: Record<AIProvider, string>

  // Runtime state (not persisted)
  isLoading: boolean
  suggestions: RewriteSuggestion[]
  error: string | null

  // Selection context for rewrite
  rewriteSelection: { from: number; to: number; text: string; context: string } | null

  // Actions
  setProvider: (provider: AIProvider) => void
  setModel: (model: string) => void
  setApiKey: (provider: AIProvider, key: string) => void
  setLoading: (loading: boolean) => void
  setSuggestions: (suggestions: RewriteSuggestion[]) => void
  setError: (error: string | null) => void
  setRewriteSelection: (sel: { from: number; to: number; text: string; context: string } | null) => void
  clearRewrite: () => void
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKeys: { anthropic: '', openai: '', google: '' },

      isLoading: false,
      suggestions: [],
      error: null,
      rewriteSelection: null,

      setProvider: (provider) => set({ provider }),
      setModel: (model) => set({ model }),
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setLoading: (isLoading) => set({ isLoading }),
      setSuggestions: (suggestions) => set({ suggestions, error: null, isLoading: false }),
      setError: (error) => set({ error, isLoading: false }),
      setRewriteSelection: (rewriteSelection) => set({ rewriteSelection }),
      clearRewrite: () => set({ rewriteSelection: null, suggestions: [], error: null, isLoading: false }),
    }),
    {
      name: 'recoil-fountain-ai',
      partialize: (state) => ({
        provider: state.provider,
        model: state.model,
        apiKeys: state.apiKeys,
      }),
    },
  ),
)
