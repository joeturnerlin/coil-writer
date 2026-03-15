/**
 * Note Transfer — content-anchored annotation recovery.
 *
 * When document content shifts (edits, reflows), annotations lose their
 * absolute positions. This module anchors annotations to structural
 * landmarks (scene headings, character cues, surrounding text) and
 * recovers positions via a 4-step confidence chain:
 *   exact → heading → fuzzy → orphaned
 *
 * Pure logic — no UI, no persistence.
 */

import type { Annotation } from '../editor/types'

export interface AnchorData {
  anchorHeading: string
  anchorContext: string
  anchorCharacter: string
  fileName: string
}

// Scene heading pattern (same as scene-model.ts)
const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*.+/im

// Character cue: all-caps name on its own line, optionally with parenthetical extension
const CHARACTER_CUE_RE = /^([A-Z][A-Z0-9 .']+)(\s*\(.*\))?$/

/**
 * Anchor an annotation to structural landmarks in the document.
 *
 * Captures:
 * - Nearest scene heading above the annotation position
 * - ±50 chars of context around the annotated range
 * - Character cue if the annotation sits inside dialogue
 */
export function anchorAnnotation(annotation: Annotation, content: string, fileName = ''): AnchorData {
  // 1. Find nearest scene heading above annotation.from
  const textBefore = content.slice(0, annotation.from)
  const linesBefore = textBefore.split('\n')

  let anchorHeading = ''
  for (let i = linesBefore.length - 1; i >= 0; i--) {
    const trimmed = linesBefore[i].trim()
    if (SCENE_HEADING_RE.test(trimmed)) {
      anchorHeading = trimmed
      break
    }
    // Forced heading (.HEADING)
    if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.') {
      anchorHeading = trimmed.slice(1).trim()
      break
    }
  }

  // 2. Capture ±50 chars around the annotation for context matching
  const ctxStart = Math.max(0, annotation.from - 50)
  const ctxEnd = Math.min(content.length, annotation.to + 50)
  const anchorContext = content.slice(ctxStart, ctxEnd)

  // 3. Detect character cue above annotation (for dialogue anchoring)
  let anchorCharacter = ''
  let nonBlankCount = 0
  for (let i = linesBefore.length - 1; i >= 0; i--) {
    const trimmed = linesBefore[i].trim()
    if (trimmed === '') continue

    // If we hit a scene heading before finding a character, stop
    if (SCENE_HEADING_RE.test(trimmed)) break
    if (trimmed.startsWith('.') && trimmed.length > 1 && trimmed[1] !== '.') break

    const charMatch = CHARACTER_CUE_RE.exec(trimmed)
    if (charMatch && trimmed.length < 50) {
      const baseName = trimmed.replace(/\s*\(.*\)$/, '')
      if (!/[.!?]$/.test(baseName)) {
        anchorCharacter = baseName.trim()
        break
      }
    }

    // Stop searching after 10 non-blank lines (we're too far from a cue)
    nonBlankCount++
    if (nonBlankCount >= 10) break
  }

  return {
    anchorHeading,
    anchorContext,
    anchorCharacter,
    fileName,
  }
}

/**
 * Resolve an anchor back to document positions using a 4-step recovery chain.
 *
 * 1. exact:    original positions still hold the same text
 * 2. heading:  find scene heading, search within 500 chars after it
 * 3. fuzzy:    search entire document for context substring
 * 4. orphaned: return original positions (annotation is lost)
 */
export function resolveAnchor(
  anchor: AnchorData,
  originalFrom: number,
  originalTo: number,
  selectedText: string,
  content: string,
): { from: number; to: number; confidence: 'exact' | 'heading' | 'fuzzy' | 'orphaned' } {
  // ── Step 1: Exact match at original positions ──
  if (originalFrom >= 0 && originalTo <= content.length && content.slice(originalFrom, originalTo) === selectedText) {
    return { from: originalFrom, to: originalTo, confidence: 'exact' }
  }

  // ── Step 2: Heading remap ──
  if (anchor.anchorHeading && selectedText) {
    const headingIdx = content.indexOf(anchor.anchorHeading)
    if (headingIdx !== -1) {
      // Search within 500 chars after the heading
      const searchStart = headingIdx
      const searchEnd = Math.min(content.length, headingIdx + anchor.anchorHeading.length + 500)
      const searchRegion = content.slice(searchStart, searchEnd)
      const textIdx = searchRegion.indexOf(selectedText)
      if (textIdx !== -1) {
        const newFrom = searchStart + textIdx
        const newTo = newFrom + selectedText.length
        return { from: newFrom, to: newTo, confidence: 'heading' }
      }
    }
  }

  // ── Step 3: Fuzzy — search entire document for context substring ──
  if (anchor.anchorContext && selectedText) {
    // Try finding the full context string first
    let contextIdx = content.indexOf(anchor.anchorContext)

    if (contextIdx === -1) {
      // Fall back to a 20-char core substring from the middle of anchorContext
      const ctx = anchor.anchorContext
      if (ctx.length >= 20) {
        const mid = Math.floor(ctx.length / 2)
        const sub = ctx.slice(Math.max(0, mid - 10), mid + 10)
        contextIdx = content.indexOf(sub)
      }
    }

    if (contextIdx !== -1) {
      // Within the found context region, locate the selected text
      const regionStart = Math.max(0, contextIdx - 50)
      const regionEnd = Math.min(content.length, contextIdx + anchor.anchorContext.length + 50)
      const region = content.slice(regionStart, regionEnd)
      const textIdx = region.indexOf(selectedText)
      if (textIdx !== -1) {
        const newFrom = regionStart + textIdx
        const newTo = newFrom + selectedText.length
        return { from: newFrom, to: newTo, confidence: 'fuzzy' }
      }
    }

    // Last resort: search entire document for selectedText
    const globalIdx = content.indexOf(selectedText)
    if (globalIdx !== -1) {
      return {
        from: globalIdx,
        to: globalIdx + selectedText.length,
        confidence: 'fuzzy',
      }
    }
  }

  // ── Step 4: Orphaned — cannot recover ──
  return { from: originalFrom, to: originalTo, confidence: 'orphaned' }
}
