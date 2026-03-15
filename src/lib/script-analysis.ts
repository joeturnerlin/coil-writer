/**
 * Script Analysis — sends full screenplay to Gemini for voice profile extraction.
 *
 * Direct-to-Gemini call from browser (CORS supported).
 * Falls back to /api/analyze serverless proxy for "try free" mode.
 */

import { getVoiceProfile, saveVoiceProfile } from './persistence'
import type { VoiceProfile } from './voice-profile'
import { hashScript } from './voice-profile'

export type AnalysisPhase =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'analyzing'; startedAt: number }
  | { status: 'complete'; summary: string; profile: VoiceProfile }
  | { status: 'error'; message: string }

const ANALYSIS_SYSTEM_PROMPT = `You are a screenplay dialogue analyst. You extract character voice profiles from Fountain-format screenplays. Your output is structured JSON only — no prose, no commentary.

Rules:
1. Every claim must cite evidence. For patterns, quote the exact dialogue line. For FORBIDDEN patterns, quote the line that proves the character NEVER uses that construction.
2. FORBIDDEN patterns are your highest-priority extraction. A FORBIDDEN pattern is a word, phrase, syntactic structure, or rhetorical device that a character demonstrably avoids across the entire script. Finding what a character does NOT say is more valuable than finding what they do say.
3. Voice convergence detection: If two or more characters share 3+ identical speech patterns with no distinguishing FORBIDDEN patterns between them, flag this in the convergence_warnings array.
4. Adapt to cast size:
   - 2 characters: Deep extraction. Maximize contrast between the two. Every pattern found in one should be checked against the other.
   - 3-6 characters: Standard extraction. Focus on the top 3-4 most distinctive traits per character.
   - 7+ characters: Triage. Only profile characters with 5+ lines of dialogue. Group minor characters under an ENSEMBLE_DEFAULT profile.
5. Stay under 4000 tokens total output.`

function buildAnalysisUserPrompt(scriptContent: string): string {
  return `Analyze the following screenplay and return a JSON voice profile for each character.

For each character, extract:

1. FORBIDDEN_PATTERNS (most important): Words, phrases, or constructions this character never uses. Prove each by contrasting with a character who DOES use it, or by demonstrating sustained absence across 5+ lines of dialogue. Minimum 3 per character if the character has 8+ lines.

2. VOCABULARY: Distinctive word choices. Quote the line.

3. SYNTAX: Sentence structure tendencies (fragments, run-ons, subordinate clauses, questions-as-statements). Quote the line.

4. RHYTHM: Average sentence length bucket (terse: 1-5 words, moderate: 6-15, verbose: 16+). Interruption patterns. Quote the line.

5. RHETORIC: How they argue or persuade (direct commands, rhetorical questions, deflection, sarcasm, appeals to emotion/logic). Quote the line.

6. PROFANITY_REGISTER: None / mild / moderate / heavy. Specific terms used.

7. FORMALITY_AXIS: On a scale: street / casual / neutral / formal / ornate.

Return as valid JSON with this structure:
{
  "schema_version": "1.0.0",
  "characters": [...],
  "convergence_warnings": [...]
}

Each character object must have: name, forbidden_patterns, vocabulary, syntax, rhythm (with length_bucket and patterns), rhetoric, profanity_register, formality_axis.

Each pattern must have: pattern (string), evidence (quoted line).

No markdown fences. No explanation outside the JSON.

<screenplay>
${scriptContent}
</screenplay>`
}

function parseProfileResponse(text: string, sourceHash: string, modelId: string): VoiceProfile {
  // Strip markdown fences if present
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '')

  const parsed = JSON.parse(cleaned)

  // Validate basic structure
  if (!parsed.characters || !Array.isArray(parsed.characters)) {
    throw new Error('Invalid profile: missing characters array')
  }

  return {
    schema_version: '1.0.0',
    source_hash: sourceHash,
    generated_at: new Date().toISOString(),
    model_id: modelId,
    characters: parsed.characters,
    convergence_warnings: parsed.convergence_warnings || [],
  }
}

/**
 * Analyze a screenplay via direct Gemini API call.
 * Returns the extracted voice profile.
 */
export async function analyzeScript(
  scriptContent: string,
  apiKey: string,
  model = 'gemini-2.5-pro',
  signal?: AbortSignal,
): Promise<VoiceProfile> {
  const sourceHash = await hashScript(scriptContent)

  // Check cache first
  const cached = await getVoiceProfile(sourceHash)
  if (cached) {
    return JSON.parse(cached) as VoiceProfile
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: buildAnalysisUserPrompt(scriptContent) }] }],
        generationConfig: {
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini analysis error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  const profile = parseProfileResponse(text, sourceHash, model)

  // Cache in IndexedDB
  await saveVoiceProfile(sourceHash, JSON.stringify(profile))

  return profile
}

/**
 * Analyze via the server proxy (for "try free" mode without user API key).
 */
export async function analyzeScriptViaProxy(scriptContent: string, signal?: AbortSignal): Promise<VoiceProfile> {
  const sourceHash = await hashScript(scriptContent)

  const cached = await getVoiceProfile(sourceHash)
  if (cached) {
    return JSON.parse(cached) as VoiceProfile
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ scriptContent }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Analysis proxy error ${response.status}: ${err}`)
  }

  const data = await response.json()
  if (data.error) throw new Error(data.error)

  const profile = parseProfileResponse(data.text, sourceHash, 'gemini-2.5-pro (server)')

  await saveVoiceProfile(sourceHash, JSON.stringify(profile))

  return profile
}

/**
 * Build a summary string for the analysis completion message.
 */
export function buildAnalysisSummary(profile: VoiceProfile): string {
  const charCount = profile.characters.length
  const forbiddenCount = profile.characters.reduce((sum, c) => sum + c.forbidden_patterns.length, 0)
  const warnings = profile.convergence_warnings.length
  let summary = `${charCount} character${charCount !== 1 ? 's' : ''}, ${forbiddenCount} forbidden patterns`
  if (warnings > 0) {
    summary += `, ${warnings} voice convergence warning${warnings !== 1 ? 's' : ''}`
  }
  return summary
}
