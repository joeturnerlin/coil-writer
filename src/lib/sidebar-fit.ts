import { create } from 'zustand'

/** Pixel constants shared by the scene rows and the width fit (keep in step with EpisodeNavigator). */
export const SCENE_ROW = {
  borderLeft: 2,
  padLeft: 10,
  numberCol: 28,
  gap: 8,
  padRight: 12,
  scrollbar: 12,
  slack: 8,
} as const
export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 180

/** Width that fits the longest heading text (px), clamped to the sidebar min/max. */
export function computeFitWidth(longestTextPx: number): number {
  const r = SCENE_ROW
  const chrome = r.borderLeft + r.padLeft + r.numberCol + r.gap + r.padRight + r.scrollbar + r.slack
  return Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.ceil(longestTextPx) + chrome)))
}

/** Splits 'INT. KITCHEN - DAY' into the dimmed scene prefix and the location; forced '.' headings have no prefix. */
export function splitSlugline(title: string): { prefix: string; rest: string } {
  const m = title.match(/^(INT\.\/EXT\.|INT\/EXT\.|I\/E\.|INT\.|EXT\.)\s*/i)
  return m ? { prefix: m[0], rest: title.slice(m[0].length) } : { prefix: '', rest: title }
}

/** Auto-fit width measured by the scene list (not persisted). */
export const useFitWidth = create<{ fit: number; setFit: (w: number) => void }>((set) => ({
  fit: SIDEBAR_DEFAULT,
  setFit: (fit) => set({ fit }),
}))
