import { useAIStore } from '../store/ai-store'
import { DEFAULT_MODEL } from './models'
/**
 * Script Analysis — sends full screenplay through the shared analysis handler.
 *
 * Uses /api/analyze on web and desktop.
 */

import { deleteVoiceProfile, getVoiceProfile, saveVoiceProfile } from './persistence'
import type { VoiceProfile } from './voice-profile'
import { hashScript } from './voice-profile'

export type AnalysisPhase =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'analyzing'; startedAt: number }
  | { status: 'complete'; summary: string; profile: VoiceProfile }
  | { status: 'error'; message: string }

function parseProfileResponse(text: string, sourceHash: string, modelId: string): VoiceProfile {
  if (!text) throw new Error('Empty response from AI — no text returned')

  // Strip markdown fences if present
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    // Try to recover truncated JSON by closing brackets
    try {
      parsed = JSON.parse(`${cleaned}]}`)
    } catch {
      try {
        parsed = JSON.parse(`${cleaned}"]}]}`)
      } catch {
        throw new Error(`Failed to parse AI response as JSON: ${(e as Error).message}`)
      }
    }
  }

  // Validate basic structure
  if (!parsed.characters || !Array.isArray(parsed.characters)) {
    throw new Error('Invalid profile: missing characters array')
  }

  // Normalize each character — ensure required arrays exist
  const characters = (parsed.characters as Record<string, unknown>[]).map((c) => ({
    name: String(c.name || c.character_name || c.character || 'UNKNOWN'),
    forbidden_patterns: Array.isArray(c.forbidden_patterns) ? c.forbidden_patterns : [],
    vocabulary: Array.isArray(c.vocabulary) ? c.vocabulary : [],
    syntax: Array.isArray(c.syntax) ? c.syntax : [],
    rhythm:
      c.rhythm && typeof c.rhythm === 'object'
        ? (c.rhythm as { length_bucket: string; patterns: unknown[] })
        : { length_bucket: 'moderate', patterns: [] },
    rhetoric: Array.isArray(c.rhetoric) ? c.rhetoric : [],
    profanity_register: String(c.profanity_register || 'none'),
    formality_axis: String(c.formality_axis || 'neutral'),
  }))

  return {
    schema_version: '1.0.0',
    source_hash: sourceHash,
    generated_at: new Date().toISOString(),
    model_id: modelId,
    characters: characters as VoiceProfile['characters'],
    convergence_warnings: Array.isArray(parsed.convergence_warnings) ? parsed.convergence_warnings : [],
  }
}

export async function analyzeScriptViaProxy(scriptContent: string, signal?: AbortSignal): Promise<VoiceProfile> {
  const sourceHash = await hashScript(scriptContent)

  const cached = await getVoiceProfile(sourceHash)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (parsed?.characters && Array.isArray(parsed.characters)) {
        const normalized = normalizeProfile(parsed)
        // Invalidate cache if all names are UNKNOWN (bad prior extraction)
        const allUnknown = normalized.characters.every((c) => c.name === 'UNKNOWN')
        if (!allUnknown) return normalized
        await deleteVoiceProfile(sourceHash)
      } else {
        await deleteVoiceProfile(sourceHash)
      }
    } catch {
      await deleteVoiceProfile(sourceHash)
    }
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ scriptContent, apiKey: useAIStore.getState().apiKeys[DEFAULT_MODEL.provider] || undefined }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Analysis proxy error ${response.status}: ${err}`)
  }

  const data = await response.json()
  if (data.error) throw new Error(data.error)

  const profile = parseProfileResponse(data.text, sourceHash, DEFAULT_MODEL.id)

  await saveVoiceProfile(sourceHash, JSON.stringify(profile))

  return profile
}

/**
 * Build a summary string for the analysis completion message.
 */
/** Normalize a profile object to ensure all required arrays exist */
function normalizeProfile(parsed: Record<string, unknown>): VoiceProfile {
  const chars = Array.isArray(parsed.characters) ? parsed.characters : []
  return {
    schema_version: '1.0.0',
    source_hash: String(parsed.source_hash || ''),
    generated_at: String(parsed.generated_at || ''),
    model_id: String(parsed.model_id || ''),
    characters: chars.map((c: Record<string, unknown>) => ({
      name: String(c.name || c.character_name || c.character || 'UNKNOWN'),
      forbidden_patterns: Array.isArray(c.forbidden_patterns) ? c.forbidden_patterns : [],
      vocabulary: Array.isArray(c.vocabulary) ? c.vocabulary : [],
      syntax: Array.isArray(c.syntax) ? c.syntax : [],
      rhetoric: Array.isArray(c.rhetoric) ? c.rhetoric : [],
      rhythm:
        c.rhythm && typeof c.rhythm === 'object'
          ? (c.rhythm as VoiceProfile['characters'][0]['rhythm'])
          : { length_bucket: 'moderate' as const, patterns: [] },
      profanity_register: (c.profanity_register || 'none') as VoiceProfile['characters'][0]['profanity_register'],
      formality_axis: (c.formality_axis || 'neutral') as VoiceProfile['characters'][0]['formality_axis'],
    })),
    convergence_warnings: Array.isArray(parsed.convergence_warnings) ? parsed.convergence_warnings : [],
  }
}

export function buildAnalysisSummary(profile: VoiceProfile): string {
  const chars = profile?.characters ?? []
  const charCount = chars.length
  const forbiddenCount = chars.reduce((sum, c) => sum + (c?.forbidden_patterns?.length ?? 0), 0)
  const warnings = profile?.convergence_warnings?.length ?? 0
  let summary = `${charCount} character${charCount !== 1 ? 's' : ''}, ${forbiddenCount} forbidden patterns`
  if (warnings > 0) {
    summary += `, ${warnings} voice convergence warning${warnings !== 1 ? 's' : ''}`
  }
  return summary
}
