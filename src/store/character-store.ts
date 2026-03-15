/**
 * Character Store — character profiles + manual overrides + voice flywheel state.
 */

import { create } from 'zustand'
import { getProfileOverrides, saveProfileOverride } from '../lib/persistence'
import type { CharacterProfile } from '../lib/voice-profile'

export interface CharacterOverrides {
  addedForbidden?: string[]
  removedForbidden?: string[]
  addedVocabulary?: string[]
  formality?: CharacterProfile['formality_axis']
  profanity?: CharacterProfile['profanity_register']
  voiceNotes?: string
  source: 'manual' | 'analysis'
}

interface CharacterState {
  baseProfiles: CharacterProfile[]
  overrides: Record<string, CharacterOverrides>
  staleFlags: Record<string, boolean>
  acceptCountSinceAnalysis: Record<string, number>
  loading: boolean

  setBaseProfiles: (profiles: CharacterProfile[]) => void
  setOverride: (characterName: string, overrides: CharacterOverrides) => void
  clearOverrides: (characterName: string) => void
  markStale: (characterName: string) => void
  clearStaleFlags: () => void
  incrementAcceptCount: (characterName: string) => void
  resetAcceptCounts: () => void
  loadOverrides: (fileName: string) => Promise<void>
  persistOverrides: (fileName: string) => Promise<void>
  getEffectiveProfile: (characterName: string) => CharacterProfile | null
}

const STALE_THRESHOLD = 8

export const useCharacterStore = create<CharacterState>((set, get) => ({
  baseProfiles: [],
  overrides: {},
  staleFlags: {},
  acceptCountSinceAnalysis: {},
  loading: false,

  setBaseProfiles: (profiles) => {
    set({
      baseProfiles: profiles,
      staleFlags: {},
      acceptCountSinceAnalysis: {},
    })
  },

  setOverride: (characterName, overrides) =>
    set((s) => ({
      overrides: { ...s.overrides, [characterName]: overrides },
    })),

  clearOverrides: (characterName) =>
    set((s) => {
      const next = { ...s.overrides }
      delete next[characterName]
      return { overrides: next }
    }),

  markStale: (characterName) =>
    set((s) => ({
      staleFlags: { ...s.staleFlags, [characterName]: true },
    })),

  clearStaleFlags: () => set({ staleFlags: {} }),

  incrementAcceptCount: (characterName) =>
    set((s) => {
      const newCount = (s.acceptCountSinceAnalysis[characterName] || 0) + 1
      const newStale = newCount >= STALE_THRESHOLD ? { ...s.staleFlags, [characterName]: true } : s.staleFlags
      return {
        acceptCountSinceAnalysis: {
          ...s.acceptCountSinceAnalysis,
          [characterName]: newCount,
        },
        staleFlags: newStale,
      }
    }),

  resetAcceptCounts: () => set({ acceptCountSinceAnalysis: {} }),

  loadOverrides: async (fileName) => {
    set({ loading: true })
    try {
      const records = await getProfileOverrides(fileName)
      const overrides: Record<string, CharacterOverrides> = {}
      for (const r of records) {
        try {
          overrides[r.characterName] = JSON.parse(r.overrides)
        } catch {
          /* skip corrupted */
        }
      }
      set({ overrides, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  persistOverrides: async (fileName) => {
    const { overrides } = get()
    for (const [characterName, ov] of Object.entries(overrides)) {
      await saveProfileOverride(fileName, characterName, JSON.stringify(ov), ov.source ?? 'manual')
    }
  },

  getEffectiveProfile: (characterName) => {
    const { baseProfiles, overrides } = get()
    const base = baseProfiles.find((p) => p.name.toLowerCase() === characterName.toLowerCase())
    if (!base) return null

    const ov = overrides[characterName]
    if (!ov) return base

    const merged = { ...base }

    if (ov.addedForbidden) {
      const existing = merged.forbidden_patterns.map((f) => f.pattern)
      for (const pat of ov.addedForbidden) {
        if (!existing.includes(pat)) {
          merged.forbidden_patterns = [...merged.forbidden_patterns, { pattern: pat, evidence: 'User-added override' }]
        }
      }
    }
    if (ov.removedForbidden) {
      merged.forbidden_patterns = merged.forbidden_patterns.filter((f) => !ov.removedForbidden!.includes(f.pattern))
    }
    if (ov.addedVocabulary) {
      const existing = merged.vocabulary.map((v) => v.pattern)
      for (const pat of ov.addedVocabulary) {
        if (!existing.includes(pat)) {
          merged.vocabulary = [...merged.vocabulary, { pattern: pat, evidence: 'User-added override' }]
        }
      }
    }
    if (ov.formality) merged.formality_axis = ov.formality
    if (ov.profanity) merged.profanity_register = ov.profanity

    return merged
  },
}))
