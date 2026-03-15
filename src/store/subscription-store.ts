/**
 * Subscription Store — tier tracking, per-feature gates, and usage counters.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubscriptionTier = 'free' | 'pro'

export interface UsageCounters {
  rewritesToday: number
  subtextThisMonth: number
  continuityThisMonth: number
  tableReadToday: number
  lastDailyReset: string
  lastMonthlyReset: string
}

export type GatedFeature = 'rewrite' | 'edit-profiles' | 'subtext' | 'structure-gaps' | 'continuity' | 'stash-ai'

const LIMITS: Record<GatedFeature, { free: number; period: 'day' | 'month' | 'unlimited' }> = {
  rewrite: { free: 10, period: 'day' },
  'edit-profiles': { free: 0, period: 'unlimited' },
  subtext: { free: 3, period: 'month' },
  'structure-gaps': { free: 0, period: 'unlimited' },
  continuity: { free: 1, period: 'month' },
  'stash-ai': { free: 0, period: 'unlimited' },
}

interface SubscriptionState {
  tier: SubscriptionTier
  byok: boolean
  usage: UsageCounters

  setTier: (tier: SubscriptionTier) => void
  setBYOK: (byok: boolean) => void
  incrementUsage: (feature: GatedFeature) => void
  canUse: (feature: GatedFeature) => boolean
  remainingUses: (feature: GatedFeature) => number
  syncServerUsage: (feature: GatedFeature, remaining: number) => void
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthString(): string {
  return new Date().toISOString().slice(0, 7)
}

function freshUsage(): UsageCounters {
  return {
    rewritesToday: 0,
    subtextThisMonth: 0,
    continuityThisMonth: 0,
    tableReadToday: 0,
    lastDailyReset: todayString(),
    lastMonthlyReset: monthString(),
  }
}

function resetIfNeeded(usage: UsageCounters): UsageCounters {
  const today = todayString()
  const month = monthString()
  let u = { ...usage }
  if (u.lastDailyReset !== today) {
    u = { ...u, rewritesToday: 0, tableReadToday: 0, lastDailyReset: today }
  }
  if (u.lastMonthlyReset !== month) {
    u = { ...u, subtextThisMonth: 0, continuityThisMonth: 0, lastMonthlyReset: month }
  }
  return u
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      byok: false,
      usage: freshUsage(),

      setTier: (tier) => set({ tier }),
      setBYOK: (byok) => set({ byok }),

      incrementUsage: (feature: GatedFeature) =>
        set((s) => {
          const u = resetIfNeeded(s.usage)
          switch (feature) {
            case 'rewrite':
              return { usage: { ...u, rewritesToday: u.rewritesToday + 1 } }
            case 'subtext':
              return { usage: { ...u, subtextThisMonth: u.subtextThisMonth + 1 } }
            case 'continuity':
              return { usage: { ...u, continuityThisMonth: u.continuityThisMonth + 1 } }
            default:
              return { usage: u }
          }
        }),

      canUse: (feature: GatedFeature) => {
        const s = get()
        if (s.tier === 'pro') return true
        if (s.byok && feature === 'rewrite') return true
        const limit = LIMITS[feature]
        if (limit.free === 0) return false
        const u = resetIfNeeded(s.usage)
        switch (feature) {
          case 'rewrite':
            return u.rewritesToday < limit.free
          case 'subtext':
            return u.subtextThisMonth < limit.free
          case 'continuity':
            return u.continuityThisMonth < limit.free
          default:
            return false
        }
      },

      remainingUses: (feature: GatedFeature) => {
        const s = get()
        if (s.tier === 'pro') return Number.POSITIVE_INFINITY
        if (s.byok && feature === 'rewrite') return Number.POSITIVE_INFINITY
        const limit = LIMITS[feature]
        if (limit.free === 0) return 0
        const u = resetIfNeeded(s.usage)
        switch (feature) {
          case 'rewrite':
            return Math.max(0, limit.free - u.rewritesToday)
          case 'subtext':
            return Math.max(0, limit.free - u.subtextThisMonth)
          case 'continuity':
            return Math.max(0, limit.free - u.continuityThisMonth)
          default:
            return 0
        }
      },

      syncServerUsage: (_feature, _remaining) => {
        // Placeholder — sync server-reported remaining count
      },
    }),
    {
      name: 'coil-subscription',
      partialize: (state) => ({
        tier: state.tier,
        byok: state.byok,
        usage: state.usage,
      }),
    },
  ),
)
