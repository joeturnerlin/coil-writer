import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorMode } from '../editor/types'
import type { PresetId } from '../themes/presets'
import { applyPreset, getPreset } from '../themes/presets'

interface SettingsState {
  preset: PresetId
  /** Derived from preset.isDark — components that need 'dark'|'light' read this */
  theme: 'dark' | 'light'
  fontSize: number
  zoomLevel: number
  showEpisodeNav: boolean
  editorMode: EditorMode
  showAnnotations: boolean

  setPreset: (preset: PresetId) => void
  /** Legacy toggle — cycles: recoil → muted → light → recoil */
  toggleTheme: () => void
  setFontSize: (size: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  toggleEpisodeNav: () => void
  setEditorMode: (mode: EditorMode) => void
  toggleAnnotations: () => void
}

const CYCLE_ORDER: PresetId[] = ['recoil', 'muted', 'light']

// Apply default preset immediately so CSS vars exist before first render.
// onRehydrateStorage will override with the persisted preset once hydration completes.
applyPreset(getPreset('recoil'))

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      preset: 'recoil',
      theme: 'dark',
      fontSize: 16,
      zoomLevel: 100,
      showEpisodeNav: true,
      editorMode: 'edit' as const,
      showAnnotations: false,

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
      resetZoom: () => set({ zoomLevel: 100 }),
      toggleEpisodeNav: () => set((s) => ({ showEpisodeNav: !s.showEpisodeNav })),
      setEditorMode: (editorMode) =>
        set({
          editorMode,
          showAnnotations: editorMode === 'annotate',
        }),
      toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
    }),
    {
      name: 'coil-settings-v2',
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          // Migrate to 12pt Courier Prime (industry standard)
          const state = persisted as Record<string, unknown>
          return { ...state, fontSize: 16, zoomLevel: 100 }
        }
        return persisted as SettingsState
      },
      onRehydrateStorage: () => {
        // Apply the persisted preset on load
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
