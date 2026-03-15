import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveOverlay, AnalyzeLeftTab, EditorMode, StructureFramework } from '../editor/types'
import type { PresetId } from '../themes/presets'
import { applyPreset, getPreset } from '../themes/presets'

interface SettingsState {
  preset: PresetId
  theme: 'dark' | 'light'
  fontSize: number
  zoomLevel: number
  showEpisodeNav: boolean
  editorMode: EditorMode
  showAnnotations: boolean

  // New fields
  activeOverlay: ActiveOverlay
  structureFramework: StructureFramework
  activeLeftTab: AnalyzeLeftTab
  onboardingComplete: boolean

  setPreset: (preset: PresetId) => void
  toggleTheme: () => void
  setFontSize: (size: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  toggleEpisodeNav: () => void
  setEditorMode: (mode: EditorMode) => void
  toggleAnnotations: () => void

  setActiveOverlay: (overlay: ActiveOverlay) => void
  setStructureFramework: (fw: StructureFramework) => void
  setActiveLeftTab: (tab: AnalyzeLeftTab) => void
  setOnboardingComplete: (complete: boolean) => void
}

const CYCLE_ORDER: PresetId[] = ['recoil', 'muted', 'light']

applyPreset(getPreset('recoil'))

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      preset: 'recoil',
      theme: 'dark',
      fontSize: 16,
      zoomLevel: 120,
      showEpisodeNav: true,
      editorMode: 'write' as EditorMode,
      showAnnotations: false,

      activeOverlay: 'none' as ActiveOverlay,
      structureFramework: 'save-the-cat' as StructureFramework,
      activeLeftTab: 'structure' as AnalyzeLeftTab,
      onboardingComplete: false,

      setPreset: (preset) => {
        const p = getPreset(preset)
        applyPreset(p)
        set({ preset, theme: p.isDark ? 'dark' : 'light' })
      },
      toggleTheme: () =>
        set((s) => {
          const idx = CYCLE_ORDER.indexOf(s.preset)
          const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
          const p = getPreset(next)
          applyPreset(p)
          return { preset: next, theme: p.isDark ? 'dark' : 'light' }
        }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(10, Math.min(24, fontSize)) }),
      zoomIn: () => set((s) => ({ zoomLevel: Math.min(200, s.zoomLevel + 10) })),
      zoomOut: () => set((s) => ({ zoomLevel: Math.max(70, s.zoomLevel - 10) })),
      resetZoom: () => set({ zoomLevel: 120 }),
      toggleEpisodeNav: () => set((s) => ({ showEpisodeNav: !s.showEpisodeNav })),
      setEditorMode: (editorMode) =>
        set({
          editorMode,
          showAnnotations: editorMode === 'analyze',
        }),
      toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),

      setActiveOverlay: (activeOverlay) => set({ activeOverlay }),
      setStructureFramework: (structureFramework) => set({ structureFramework }),
      setActiveLeftTab: (activeLeftTab) => set({ activeLeftTab }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
    }),
    {
      name: 'coil-settings-v3',
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>
        if (version === 0) {
          return { ...state, fontSize: 16, zoomLevel: 120 }
        }
        if (version === 1) {
          // Migrate 'edit' -> 'write', 'annotate' -> 'analyze'
          const mode = state.editorMode
          const newMode = mode === 'edit' ? 'write' : mode === 'annotate' ? 'analyze' : mode
          return {
            ...state,
            editorMode: newMode,
            activeOverlay: 'none',
            structureFramework: 'save-the-cat',
            activeLeftTab: 'structure',
            onboardingComplete: false,
          }
        }
        return persisted as SettingsState
      },
      onRehydrateStorage: () => {
        return (state?: SettingsState) => {
          if (state) {
            const p = getPreset(state.preset)
            applyPreset(p)
          }
        }
      },
    },
  ),
)
