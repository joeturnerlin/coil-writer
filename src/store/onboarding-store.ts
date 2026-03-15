import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingState {
  tourStep: number | null
  seenFeatures: string[]

  startTour: () => void
  nextStep: () => void
  skipTour: () => void
  markFeatureSeen: (feature: string) => void
  hasSeenFeature: (feature: string) => boolean
}

const TOTAL_STEPS = 5

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      tourStep: null,
      seenFeatures: [],

      startTour: () => set({ tourStep: 0 }),
      nextStep: () =>
        set((s) => ({
          tourStep: s.tourStep !== null && s.tourStep < TOTAL_STEPS - 1 ? s.tourStep + 1 : null,
        })),
      skipTour: () => set({ tourStep: null }),
      markFeatureSeen: (feature) =>
        set((s) => ({
          seenFeatures: s.seenFeatures.includes(feature) ? s.seenFeatures : [...s.seenFeatures, feature],
        })),
      hasSeenFeature: (feature) => get().seenFeatures.includes(feature),
    }),
    {
      name: 'coil-onboarding',
      partialize: (s) => ({ seenFeatures: s.seenFeatures }),
    },
  ),
)
