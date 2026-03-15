/**
 * Profile Updater — hybrid voice flywheel implementation.
 *
 * Layer 1 (immediate): Local delta on acceptance
 * Layer 2 (staleness): Increment per accepted rewrite per character
 * Layer 3 (queued deltas): Store in Dexie for re-analysis
 */

import { useCharacterStore } from '../store/character-store'
import { savePendingDelta } from './persistence'
import type { CharacterProfile } from './voice-profile'

export interface DeltaResult {
  characterName: string
  forbiddenViolations: string[]
}

export function computeProfileDelta(
  originalText: string,
  acceptedText: string,
  characterName: string,
  profile: CharacterProfile | null,
): DeltaResult | null {
  if (!profile) return null

  const forbiddenViolations: string[] = []

  for (const fp of profile.forbidden_patterns) {
    const regex = new RegExp(escapeRegex(fp.pattern), 'i')
    if (regex.test(acceptedText) && !regex.test(originalText)) {
      forbiddenViolations.push(fp.pattern)
    }
  }

  return {
    characterName,
    forbiddenViolations,
  }
}

export async function applyProfileDelta(
  delta: DeltaResult,
  fileName: string,
  originalText: string,
  acceptedText: string,
): Promise<void> {
  const store = useCharacterStore.getState()

  store.incrementAcceptCount(delta.characterName)

  if (delta.forbiddenViolations.length > 0) {
    const currentOverrides = store.overrides[delta.characterName] || { source: 'analysis' as const }
    const removedForbidden = [...(currentOverrides.removedForbidden || [])]
    const addedVocabulary = [...(currentOverrides.addedVocabulary || [])]

    for (const pattern of delta.forbiddenViolations) {
      if (!removedForbidden.includes(pattern)) {
        removedForbidden.push(pattern)
        addedVocabulary.push(pattern)
      }
    }

    store.setOverride(delta.characterName, {
      ...currentOverrides,
      removedForbidden,
      addedVocabulary,
    })
  }

  await savePendingDelta(fileName, delta.characterName, originalText, acceptedText)
}

export function detectSpeakingCharacter(surroundingContext: string, selectionFrom: number): string | null {
  const textBefore = surroundingContext.slice(0, Math.min(selectionFrom, surroundingContext.length))
  const lines = textBefore.split('\n')

  let passedBlank = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed === '') {
      // In Fountain, a blank line after the selection means we've exited the dialogue block.
      // But we need to pass through the first blank to reach the character cue above.
      if (passedBlank) break
      passedBlank = true
      continue
    }

    const match = trimmed.match(/^([A-Z][A-Z0-9 .']+?)(\s*\(.*\))?$/)
    if (match && trimmed.length < 50 && !/[.!?]$/.test(match[1])) {
      return match[1].trim()
    }

    // Stop at scene headings
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) break
  }

  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
