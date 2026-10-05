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

export type AnchorConfidence = 'exact' | 'heading' | 'fuzzy' | 'ambiguous' | 'orphaned'

export interface ResolvedAnchor {
  from: number
  to: number
  confidence: AnchorConfidence
  /** Start offsets of the plausible matches when ambiguous (or a lone context-free match when orphaned) — for a reattach prompt. */
  candidates?: number[]
}

function allIndexesOf(haystack: string, needle: string, start = 0, end = haystack.length): number[] {
  const out: number[] = []
  if (!needle) return out
  const region = haystack.slice(start, end)
  let i = region.indexOf(needle)
  while (i !== -1) {
    out.push(start + i)
    i = region.indexOf(needle, i + 1)
  }
  return out
}

/**
 * Resolve an anchor back to document positions.
 *
 * 1. exact:     original positions still hold the same text
 * 2. heading:   the text occurs exactly once within 500 chars after a matching scene heading
 * 3. fuzzy:     the text occurs exactly once inside a place where the saved context matches
 * 4. ambiguous: several equally good candidates — the caller must ask the user to reattach
 * 5. orphaned:  no contextual match — original positions returned, annotation is lost
 *
 * It NEVER falls back to the first global match of the text: a note on "No." must not land on a different "No.".
 */
export function resolveAnchor(
  anchor: AnchorData,
  originalFrom: number,
  originalTo: number,
  selectedText: string,
  content: string,
): ResolvedAnchor {
  // ── Step 1: Exact match at original positions ──
  if (originalFrom >= 0 && originalTo <= content.length && content.slice(originalFrom, originalTo) === selectedText) {
    return { from: originalFrom, to: originalTo, confidence: 'exact' }
  }
  const orphan = (candidates?: number[]): ResolvedAnchor => ({
    from: originalFrom,
    to: originalTo,
    confidence: candidates && candidates.length > 1 ? 'ambiguous' : 'orphaned',
    ...(candidates && candidates.length > 0 ? { candidates } : {}),
  })
  if (!selectedText) return orphan()

  const hit = (from: number, confidence: 'heading' | 'fuzzy'): ResolvedAnchor => ({
    from,
    to: from + selectedText.length,
    confidence,
  })
  const ambiguous = new Set<number>()

  // ── Step 2: Heading remap — every occurrence of the heading, text must be unique across their windows ──
  if (anchor.anchorHeading) {
    const found = new Set<number>()
    for (const h of allIndexesOf(content, anchor.anchorHeading)) {
      const end = Math.min(content.length, h + anchor.anchorHeading.length + 500)
      for (const i of allIndexesOf(content, selectedText, h, end)) found.add(i)
    }
    if (found.size === 1) return hit([...found][0], 'heading')
    for (const i of found) ambiguous.add(i)
  }

  // ── Step 3: Context — the saved ±50 chars (or a 20-char core of them) around the text ──
  if (anchor.anchorContext) {
    const ctx = anchor.anchorContext
    // anchorAnnotation saved up to 50 chars before the text; fall back to its first position in the context
    const within = ctx.startsWith(selectedText, Math.min(50, originalFrom))
      ? Math.min(50, originalFrom)
      : ctx.indexOf(selectedText)
    const candidates = new Set<number>()
    if (within !== -1) {
      for (const c of allIndexesOf(content, ctx)) candidates.add(c + within)
    }
    if (candidates.size === 0 && ctx.length >= 20 && within !== -1) {
      const mid = Math.floor(ctx.length / 2)
      const coreStart = Math.max(0, mid - 10)
      const core = ctx.slice(coreStart, mid + 10)
      for (const c of allIndexesOf(content, core)) {
        // Text must sit in the same relative place the core had inside the saved context
        const from = c - coreStart + within
        if (from >= 0 && content.slice(from, from + selectedText.length) === selectedText) candidates.add(from)
      }
    }
    if (candidates.size === 1) return hit([...candidates][0], 'fuzzy')
    for (const i of candidates) ambiguous.add(i)
  }

  // ── Step 4/5: no unique contextual match ──
  const list = [...ambiguous].sort((a, b) => a - b)
  if (list.length > 1) return orphan(list)
  // A lone text match with no corroborating context is offered for reattachment, never applied.
  const global = allIndexesOf(content, selectedText)
  return orphan(list.length === 1 ? list : global.length > 0 && global.length <= 10 ? global : undefined)
}
