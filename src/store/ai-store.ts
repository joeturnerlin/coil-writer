import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, RewriteSuggestion } from '../lib/ai-provider'
import type { AnalysisPhase } from '../lib/script-analysis'
import type { SubtextResult } from '../lib/subtext-analysis'
import type { VoiceProfile } from '../lib/voice-profile'

interface AIState {
  // Configuration (persisted)
  provider: AIProvider
  model: string
  apiKeys: Record<AIProvider, string>

  // Comparison config (persisted)
  comparisonEnabled: boolean
  comparisonModelA: string
  comparisonProviderA: AIProvider
  comparisonModelB: string
  comparisonProviderB: AIProvider
  modelPreferences: Record<string, number> // model_id -> preference count

  // Runtime state (not persisted)
  isLoading: boolean
  suggestions: RewriteSuggestion[]
  error: string | null

  // Selection context for rewrite
  rewriteSelection: { from: number; to: number; text: string; context: string } | null

  // Voice profile (persisted hash only, full profile in IndexedDB)
  currentProfileHash: string | null
  currentProfile: VoiceProfile | null

  // Analysis state (not persisted)
  analysisState: AnalysisPhase

  // Comparison results (not persisted)
  comparisonSuggestionsA: RewriteSuggestion[] | null
  comparisonSuggestionsB: RewriteSuggestion[] | null
  comparisonLoadingA: boolean
  comparisonLoadingB: boolean
  comparisonErrorA: string | null
  comparisonErrorB: string | null

  // Subtext state (not persisted)
  subtextLoading: boolean
  subtextResult: SubtextResult | null
  subtextError: string | null
  showMediumConfidence: boolean

  // Actions
  setProvider: (provider: AIProvider) => void
  setModel: (model: string) => void
  setApiKey: (provider: AIProvider, key: string) => void
  setLoading: (loading: boolean) => void
  setSuggestions: (suggestions: RewriteSuggestion[]) => void
  setError: (error: string | null) => void
  setRewriteSelection: (sel: { from: number; to: number; text: string; context: string } | null) => void
  clearRewrite: () => void

  // Profile actions
  setCurrentProfile: (profile: VoiceProfile | null, hash: string | null) => void
  setAnalysisState: (state: AnalysisPhase) => void

  // Comparison actions
  setComparisonEnabled: (enabled: boolean) => void
  setComparisonModels: (providerA: AIProvider, modelA: string, providerB: AIProvider, modelB: string) => void
  setComparisonResultsA: (suggestions: RewriteSuggestion[] | null, error: string | null) => void
  setComparisonResultsB: (suggestions: RewriteSuggestion[] | null, error: string | null) => void
  setComparisonLoadingA: (loading: boolean) => void
  setComparisonLoadingB: (loading: boolean) => void
  clearComparison: () => void
  recordPreference: (modelId: string) => void

  // Subtext actions
  setSubtextLoading: (loading: boolean) => void
  setSubtextResult: (result: SubtextResult | null) => void
  setSubtextError: (error: string | null) => void
  clearSubtext: () => void
  toggleMediumConfidence: () => void
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      provider: 'google',
      model: 'gemini-2.5-pro',
      apiKeys: { anthropic: '', openai: '', google: '' },

      comparisonEnabled: false,
      comparisonProviderA: 'google',
      comparisonModelA: 'gemini-2.5-pro',
      comparisonProviderB: 'anthropic',
      comparisonModelB: 'claude-sonnet-4-20250514',
      modelPreferences: {},

      isLoading: false,
      suggestions: [],
      error: null,
      rewriteSelection: null,

      currentProfileHash: null,
      currentProfile: null,

      analysisState: { status: 'idle' },

      comparisonSuggestionsA: null,
      comparisonSuggestionsB: null,
      comparisonLoadingA: false,
      comparisonLoadingB: false,
      comparisonErrorA: null,
      comparisonErrorB: null,

      subtextLoading: false,
      subtextResult: null,
      subtextError: null,
      showMediumConfidence: false,

      setProvider: (provider) => set({ provider }),
      setModel: (model) => set({ model }),
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setLoading: (isLoading) => set({ isLoading }),
      setSuggestions: (suggestions) => set({ suggestions, error: null, isLoading: false }),
      setError: (error) => set({ error, isLoading: false }),
      setRewriteSelection: (rewriteSelection) => set({ rewriteSelection }),
      clearRewrite: () =>
        set({
          rewriteSelection: null,
          suggestions: [],
          error: null,
          isLoading: false,
          comparisonSuggestionsA: null,
          comparisonSuggestionsB: null,
          comparisonLoadingA: false,
          comparisonLoadingB: false,
          comparisonErrorA: null,
          comparisonErrorB: null,
        }),

      setCurrentProfile: (currentProfile, currentProfileHash) => set({ currentProfile, currentProfileHash }),
      setAnalysisState: (analysisState) => set({ analysisState }),

      setComparisonEnabled: (comparisonEnabled) => set({ comparisonEnabled }),
      setComparisonModels: (comparisonProviderA, comparisonModelA, comparisonProviderB, comparisonModelB) =>
        set({ comparisonProviderA, comparisonModelA, comparisonProviderB, comparisonModelB }),
      setComparisonResultsA: (comparisonSuggestionsA, comparisonErrorA) =>
        set({ comparisonSuggestionsA, comparisonErrorA, comparisonLoadingA: false }),
      setComparisonResultsB: (comparisonSuggestionsB, comparisonErrorB) =>
        set({ comparisonSuggestionsB, comparisonErrorB, comparisonLoadingB: false }),
      setComparisonLoadingA: (comparisonLoadingA) => set({ comparisonLoadingA }),
      setComparisonLoadingB: (comparisonLoadingB) => set({ comparisonLoadingB }),
      clearComparison: () =>
        set({
          comparisonSuggestionsA: null,
          comparisonSuggestionsB: null,
          comparisonLoadingA: false,
          comparisonLoadingB: false,
          comparisonErrorA: null,
          comparisonErrorB: null,
        }),
      recordPreference: (modelId) =>
        set((s) => ({
          modelPreferences: {
            ...s.modelPreferences,
            [modelId]: (s.modelPreferences[modelId] || 0) + 1,
          },
        })),

      setSubtextLoading: (subtextLoading) => set({ subtextLoading }),
      setSubtextResult: (subtextResult) => set({ subtextResult, subtextError: null, subtextLoading: false }),
      setSubtextError: (subtextError) => set({ subtextError, subtextLoading: false }),
      clearSubtext: () =>
        set({
          subtextLoading: false,
          subtextResult: null,
          subtextError: null,
        }),
      toggleMediumConfidence: () => set((s) => ({ showMediumConfidence: !s.showMediumConfidence })),
    }),
    {
      name: 'recoil-fountain-ai',
      partialize: (state) => ({
        provider: state.provider,
        model: state.model,
        apiKeys: state.apiKeys,
        comparisonEnabled: state.comparisonEnabled,
        comparisonProviderA: state.comparisonProviderA,
        comparisonModelA: state.comparisonModelA,
        comparisonProviderB: state.comparisonProviderB,
        comparisonModelB: state.comparisonModelB,
        modelPreferences: state.modelPreferences,
        currentProfileHash: state.currentProfileHash,
      }),
    },
  ),
)
