/** Shared shapes for the proofreader (Tier 0 observations, Tier 1 raw findings, Tier 2 verified findings). */

export type AICategory = 'spelling' | 'wrong-name' | 'day-night' | 'continuity-objective'
export type Tier0Category = 'name-variant' | 'slugline' | 'time-cue' | 'continuous-after-jump'
export type ProofreadCategory = AICategory | Tier0Category

export const AI_CATEGORIES: readonly AICategory[] = ['spelling', 'wrong-name', 'day-night', 'continuity-objective']

export interface RawEvidence {
  line: number
  quote: string
}

/** What the model returns (untrusted). */
export interface RawFinding {
  category: string
  claim: string
  suggestion?: string
  evidence: RawEvidence[]
}

export interface VerifiedEvidence {
  line: number
  quote: string
  /** Exact text of the cited line when the finding was verified; used to detect staleness. */
  lineText: string
}

export interface ProofreadFinding {
  /** Stable hash of category + cited lines + quotes; the key for "dismissed". */
  id: string
  category: ProofreadCategory
  source: 'ai' | 'tier0'
  /** 'note' = informational (e.g. two distinct roster names that look alike), never an error. */
  severity: 'warning' | 'note'
  claim: string
  suggestion?: string
  evidence: VerifiedEvidence[]
  revisionHash: string
}

export type DropReason =
  | 'schema'
  | 'category'
  | 'line-out-of-range'
  | 'quote-not-found'
  | 'spelling-rule'
  | 'name-rule'
  | 'single-evidence'
  | 'duplicate'

export type DropCounts = Record<DropReason, number>

export const emptyDropCounts = (): DropCounts => ({
  schema: 0,
  category: 0,
  'line-out-of-range': 0,
  'quote-not-found': 0,
  'spelling-rule': 0,
  'name-rule': 0,
  'single-evidence': 0,
  duplicate: 0,
})

export const totalDropped = (d: DropCounts): number => Object.values(d).reduce((a, b) => a + b, 0)
