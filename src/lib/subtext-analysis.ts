/**
 * Subtext Analysis — detects on-the-nose dialogue in screenplay scenes.
 *
 * Flags three categories:
 * 1. Literal emotion — characters stating exactly how they feel
 * 2. Exposition dump — characters telling each other things they both know
 * 3. Thematic broadcasting — characters directly stating the theme
 *
 * Uses dispatchAI to call the configured LLM provider.
 */

import { dispatchAI } from './ai-dispatch'
import type { SceneBlock } from './scene-model'

export type SubtextCategory = 'literal-emotion' | 'exposition-dump' | 'thematic-broadcasting'

export interface SubtextFlag {
  lineNumber: number
  text: string
  character: string
  category: SubtextCategory
  confidence: 'high' | 'medium'
  explanation: string
  suggestion: string
}

export interface SubtextResult {
  flags: SubtextFlag[]
  summary: string
}

const SUBTEXT_SYSTEM_PROMPT = `You are analyzing screenplay dialogue for on-the-nose writing. Flag dialogue that commits one of these sins:

1. LITERAL EMOTION (literal-emotion): Characters stating exactly how they feel. Bad: "I'm terrified." Better: Character's hands shake. Or: "Just... don't open that door."

2. EXPOSITION DUMP (exposition-dump): Characters telling each other things they both already know. Bad: "As you know, the company fired you six months ago and since then..."

3. THEMATIC BROADCASTING (thematic-broadcasting): Characters directly stating the theme of the movie. Bad: "Maybe the real treasure was the friends we made along the way."

IMPORTANT: Only flag dialogue where your confidence is HIGH or MEDIUM.
- HIGH: You are certain this is on-the-nose. Any professional script editor would flag it.
- MEDIUM: This is likely on-the-nose, but there may be intentional reasons.
- Do NOT include LOW confidence flags.

Return JSON: { "flags": [{ "lineNumber": N, "text": "the dialogue line", "character": "NAME", "category": "literal-emotion"|"exposition-dump"|"thematic-broadcasting", "confidence": "high"|"medium", "explanation": "why this is on-the-nose", "suggestion": "a brief alternative that uses subtext" }] }

If you find no on-the-nose dialogue, return { "flags": [] }.`

const VALID_CATEGORIES: SubtextCategory[] = ['literal-emotion', 'exposition-dump', 'thematic-broadcasting']
const VALID_CONFIDENCES = ['high', 'medium'] as const

/**
 * Analyze a scene block for on-the-nose dialogue.
 * Returns flags with line numbers, categories, and suggestions.
 */
export async function analyzeSubtext(scene: SceneBlock, signal?: AbortSignal): Promise<SubtextResult> {
  const result = await dispatchAI({
    task: 'subtext',
    systemPrompt: SUBTEXT_SYSTEM_PROMPT,
    userPrompt: scene.content,
    jsonMode: true,
    signal,
  })

  const parsed = JSON.parse(result.text)
  const rawFlags: unknown[] = Array.isArray(parsed.flags) ? parsed.flags : []

  // Validate and normalize each flag
  const flags: SubtextFlag[] = []
  for (const raw of rawFlags) {
    if (!raw || typeof raw !== 'object') continue
    const f = raw as Record<string, unknown>

    const category = f.category as SubtextCategory
    const confidence = f.confidence as 'high' | 'medium'

    if (!VALID_CATEGORIES.includes(category)) continue
    if (!VALID_CONFIDENCES.includes(confidence)) continue
    if (typeof f.lineNumber !== 'number') continue
    if (typeof f.text !== 'string') continue

    flags.push({
      lineNumber: f.lineNumber,
      text: f.text,
      character: typeof f.character === 'string' ? f.character : 'UNKNOWN',
      category,
      confidence,
      explanation: typeof f.explanation === 'string' ? f.explanation : '',
      suggestion: typeof f.suggestion === 'string' ? f.suggestion : '',
    })
  }

  // Build summary
  const highCount = flags.filter((f) => f.confidence === 'high').length
  const mediumCount = flags.filter((f) => f.confidence === 'medium').length
  const summary =
    flags.length === 0
      ? 'No on-the-nose dialogue detected'
      : `${flags.length} flag${flags.length === 1 ? '' : 's'}: ${highCount} high, ${mediumCount} medium`

  return { flags, summary }
}
