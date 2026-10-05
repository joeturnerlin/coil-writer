import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveOverlay, AnalyzeLeftTab, EditorMode, StructureFramework } from '../editor/types'
import type { CustomColors, CustomSlotId, CustomSlots, ThemeId } from '../themes/custom-colors'
import {
  CONTRAST_BLOCK,
  EMPTY_SLOTS,
  SLOT_NAMES,
  activeColors,
  contrastRatio,
  nextThemeId,
  resolveTheme,
} from '../themes/custom-colors'
import type { PresetId } from '../themes/presets'
import { applyPreset, getPreset } from '../themes/presets'

interface SettingsState {
  preset: ThemeId
  /** Unsaved custom colors being edited live (preset === 'draft'). */
  customDraft: CustomColors | null
  /** Built-in preset "Reset" returns to. */
  draftBase: PresetId
  customSlots: CustomSlots
  theme: 'dark' | 'light'
  fontSize: number
  zoomLevel: number
  showEpisodeNav: boolean
  leftPanelWidth: number
  editorMode: EditorMode
  showAnnotations: boolean
  showProofread: boolean

  // New fields
  activeOverlay: ActiveOverlay
  structureFramework: StructureFramework
  activeLeftTab: AnalyzeLeftTab
  onboardingComplete: boolean

  setPreset: (preset: ThemeId) => void
  setCustomColor: (key: keyof CustomColors, hex: string) => void
  /** Saves the live colors to a slot. Returns false (and saves nothing) below the 3:1 contrast floor. */
  saveCustomSlot: (slot: CustomSlotId) => boolean
  resetCustom: () => void
  toggleTheme: () => void
  setFontSize: (size: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  toggleEpisodeNav: () => void
  setLeftPanelWidth: (width: number) => void
  setEditorMode: (mode: EditorMode) => void
  toggleAnnotations: () => void
  toggleProofread: () => void

  setActiveOverlay: (overlay: ActiveOverlay) => void
  setStructureFramework: (fw: StructureFramework) => void
  setActiveLeftTab: (tab: AnalyzeLeftTab) => void
  setOnboardingComplete: (complete: boolean) => void
}

export const LEFT_PANEL_MIN = 160
export const LEFT_PANEL_MAX = 480
export const LEFT_PANEL_DEFAULT = 180

const PRESET_IDS: PresetId[] = ['recoil', 'muted', 'light']

applyPreset(getPreset('recoil'))

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      preset: 'recoil' as ThemeId,
      customDraft: null,
      draftBase: 'recoil' as PresetId,
      customSlots: EMPTY_SLOTS,
      theme: 'dark',
      fontSize: 16,
      zoomLevel: 120,
      showEpisodeNav: true,
      leftPanelWidth: LEFT_PANEL_DEFAULT,
      editorMode: 'write' as EditorMode,
      showAnnotations: false,
      showProofread: false,

      activeOverlay: 'none' as ActiveOverlay,
      structureFramework: 'save-the-cat' as StructureFramework,
      activeLeftTab: 'structure' as AnalyzeLeftTab,
      onboardingComplete: false,

      setPreset: (preset) =>
        set((s) => {
          const p = resolveTheme(preset, s.customDraft, s.customSlots)
          applyPreset(p)
          return { preset, theme: p.isDark ? 'dark' : 'light' }
        }),
      toggleTheme: () =>
        set((s) => {
          const next = nextThemeId(s.preset, s.customSlots)
          const p = resolveTheme(next, s.customDraft, s.customSlots)
          applyPreset(p)
          return { preset: next, theme: p.isDark ? 'dark' : 'light' }
        }),
      setCustomColor: (key, hex) =>
        set((s) => {
          const draft = { ...activeColors(s.preset, s.customDraft, s.customSlots), [key]: hex }
          const p = resolveTheme('draft', draft, s.customSlots)
          applyPreset(p)
          return {
            preset: 'draft',
            customDraft: draft,
            draftBase: PRESET_IDS.includes(s.preset as PresetId) ? (s.preset as PresetId) : s.draftBase,
            theme: p.isDark ? 'dark' : 'light',
          }
        }),
      saveCustomSlot: (slot) => {
        const s = useSettingsStore.getState()
        const c = activeColors(s.preset, s.customDraft, s.customSlots)
        if (contrastRatio(c.text, c.bg) < CONTRAST_BLOCK) return false
        const customSlots = { ...s.customSlots, [slot]: { ...c, name: SLOT_NAMES[slot] } }
        const p = resolveTheme(slot, c, customSlots)
        applyPreset(p)
        set({ customSlots, customDraft: null, preset: slot, theme: p.isDark ? 'dark' : 'light' })
        return true
      },
      resetCustom: () =>
        set((s) => {
          const p = getPreset(s.draftBase)
          applyPreset(p)
          return { preset: s.draftBase, customDraft: null, theme: p.isDark ? 'dark' : 'light' }
        }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(10, Math.min(24, fontSize)) }),
      zoomIn: () => set((s) => ({ zoomLevel: Math.min(200, s.zoomLevel + 10) })),
      zoomOut: () => set((s) => ({ zoomLevel: Math.max(70, s.zoomLevel - 10) })),
      resetZoom: () => set({ zoomLevel: 120 }),
      toggleEpisodeNav: () => set((s) => ({ showEpisodeNav: !s.showEpisodeNav })),
      setLeftPanelWidth: (width) =>
        set({ leftPanelWidth: Math.round(Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, width))) }),
      setEditorMode: (editorMode) =>
        set({
          editorMode,
          showAnnotations: editorMode === 'analyze',
        }),
      toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
      toggleProofread: () => set((s) => ({ showProofread: !s.showProofread })),

      setActiveOverlay: (activeOverlay) => set({ activeOverlay }),
      setStructureFramework: (structureFramework) => set({ structureFramework }),
      setActiveLeftTab: (activeLeftTab) => set({ activeLeftTab }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
    }),
    {
      name: 'coil-settings-v3',
      version: 3,
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
        if (version === 2) {
          // v3 adds custom colors; every existing field (incl. leftPanelWidth) is kept as-is.
          return { ...state, customDraft: null, draftBase: 'recoil', customSlots: EMPTY_SLOTS }
        }
        return persisted as SettingsState
      },
      onRehydrateStorage: () => {
        return (state?: SettingsState) => {
          if (state) {
            applyPreset(resolveTheme(state.preset, state.customDraft, state.customSlots))
          }
        }
      },
    },
  ),
)
