/**
 * Continuity Check — "What's broken in my script?" as a button.
 *
 * Analyzes full screenplay for continuity errors:
 * - Character presence consistency
 * - Prop tracking
 * - Timeline logic
 * - Location consistency
 * - Logic contradictions
 *
 * Uses dispatchAI to call the configured LLM provider.
 */

import { dispatchAI } from './ai-dispatch'
import type { SceneBlock } from './scene-model'

export interface ContinuityIssue {
  type: 'character' | 'prop' | 'timeline' | 'location' | 'logic'
  severity: 'error' | 'warning'
  sceneIndex: number
  description: string
  evidence: string
}

export interface ContinuityResult {
  issues: ContinuityIssue[]
  summary: string
}

const CONTINUITY_SYSTEM_PROMPT = `You are a script continuity checker. Analyze the screenplay for:

1. CHARACTER PRESENCE (character): Characters referenced before introduction, characters who disappear without reason, characters in scenes they shouldn't logically be in.

2. PROP TRACKING (prop): Objects that appear or disappear without explanation, items used before being established, items that change state inconsistently.

3. TIMELINE LOGIC (timeline): Time contradictions, impossible sequences (e.g. daytime scene followed by "earlier that morning"), duration inconsistencies.

4. LOCATION CONSISTENCY (location): Characters teleporting between distant locations without transition, interior/exterior contradictions, setting details that change.

5. LOGIC (logic): Any other logical contradiction or impossibility not covered above.

For each issue, classify severity:
- "error": A clear contradiction or impossibility that would confuse the audience.
- "warning": A potential issue that could be intentional but is worth flagging.

Return JSON: { "issues": [{ "type": "character"|"prop"|"timeline"|"location"|"logic", "severity": "error"|"warning", "sceneIndex": N, "description": "what the issue is", "evidence": "the specific text or scene detail that shows the problem" }] }

If the script has no continuity issues, return { "issues": [] }.
Use sceneIndex as the 0-based index of the scene where the issue is most visible.`

const VALID_TYPES = ['character', 'prop', 'timeline', 'location', 'logic'] as const
const VALID_SEVERITIES = ['error', 'warning'] as const

/**
 * Check full screenplay for continuity issues.
 * Sends all scene headings + content to the LLM for cross-scene analysis.
 */
export async function checkContinuity(scenes: SceneBlock[], signal?: AbortSignal): Promise<ContinuityResult> {
  // Build prompt with all scene headings + content
  const userPrompt = scenes
    .map((s) => {
      const label = s.heading ? `[Scene ${s.index}: ${s.heading}]` : `[Scene ${s.index}: Pre-heading content]`
      return `${label}\n${s.content}`
    })
    .join('\n---\n')

  const result = await dispatchAI({
    task: 'continuity',
    systemPrompt: CONTINUITY_SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    maxTokens: 4096,
    signal,
  })

  const parsed = JSON.parse(result.text)
  const rawIssues: unknown[] = Array.isArray(parsed.issues) ? parsed.issues : []

  // Validate and normalize each issue
  const issues: ContinuityIssue[] = []
  for (const raw of rawIssues) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>

    const type = r.type as ContinuityIssue['type']
    const severity = r.severity as ContinuityIssue['severity']

    if (!VALID_TYPES.includes(type)) continue
    if (!VALID_SEVERITIES.includes(severity)) continue
    if (typeof r.sceneIndex !== 'number') continue
    if (typeof r.description !== 'string') continue

    // Clamp sceneIndex to valid range
    const sceneIndex = Math.max(0, Math.min(r.sceneIndex, scenes.length - 1))

    issues.push({
      type,
      severity,
      sceneIndex,
      description: r.description,
      evidence: typeof r.evidence === 'string' ? r.evidence : '',
    })
  }

  // Build summary
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const summary =
    issues.length === 0
      ? 'No continuity issues found'
      : `${issues.length} issue${issues.length === 1 ? '' : 's'}: ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  return { issues, summary }
}
