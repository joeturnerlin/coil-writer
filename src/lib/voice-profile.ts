/**
 * Voice Profile — extracted character voice patterns from screenplay analysis.
 *
 * The profile captures FORBIDDEN patterns (highest value), vocabulary, syntax,
 * rhythm, rhetoric, profanity register, and formality axis per character.
 * Used to inject voice context into AI rewrite calls.
 */

// ── Schema Types ──

export interface EvidencedPattern {
  pattern: string
  evidence: string
}

export interface CharacterProfile {
  name: string
  forbidden_patterns: EvidencedPattern[]
  vocabulary: EvidencedPattern[]
  syntax: EvidencedPattern[]
  rhythm: {
    length_bucket: 'terse' | 'moderate' | 'verbose'
    patterns: EvidencedPattern[]
  }
  rhetoric: EvidencedPattern[]
  profanity_register: 'none' | 'mild' | 'moderate' | 'heavy'
  formality_axis: 'street' | 'casual' | 'neutral' | 'formal' | 'ornate'
}

export interface ConvergenceWarning {
  characters: string[]
  shared_patterns: string[]
}

export interface VoiceProfile {
  schema_version: '1.0.0'
  source_hash: string
  generated_at: string
  model_id: string
  characters: CharacterProfile[]
  convergence_warnings: ConvergenceWarning[]
}

// ── Hashing ──

export async function hashScript(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Compact Profile Builder ──

/**
 * Build a compact text profile for injection into rewrite system prompts.
 * Only includes characters that appear in the given text context.
 * Returns empty string if no profile or no matching characters.
 */
export function buildCompactProfile(
  profile: VoiceProfile | null,
  selectedText: string,
  surroundingContext: string,
  overrides?: Record<string, Partial<CharacterProfile>>,
): string {
  if (!profile || profile.characters.length === 0) return ''

  const combinedText = selectedText + ' ' + surroundingContext
  const characters = overrides
    ? profile.characters.map((c) => (overrides[c.name] ? ({ ...c, ...overrides[c.name] } as CharacterProfile) : c))
    : profile.characters
  const activeCharacters = characters.filter((c) => {
    const regex = new RegExp(`\\b${c.name}\\b`, 'i')
    return regex.test(combinedText)
  })

  if (activeCharacters.length === 0) return ''

  const charBlocks = activeCharacters
    .map((c) => {
      const parts: string[] = []
      parts.push(`CHARACTER: ${c.name} — ${c.formality_axis} register, ${c.rhythm.length_bucket} sentences.`)

      if (c.forbidden_patterns.length > 0) {
        parts.push(`NEVER: ${c.forbidden_patterns.map((f) => `"${f.pattern}"`).join(', ')}.`)
      }

      if (c.vocabulary.length > 0) {
        parts.push(
          `Vocabulary: ${c.vocabulary
            .slice(0, 3)
            .map((v) => `"${v.pattern}"`)
            .join(', ')}.`,
        )
      }

      if (c.rhetoric.length > 0) {
        parts.push(
          `Rhetoric: ${c.rhetoric
            .slice(0, 2)
            .map((r) => r.pattern)
            .join('; ')}.`,
        )
      }

      parts.push(`Profanity: ${c.profanity_register}.`)

      return parts.join(' ')
    })
    .join('\n')

  return charBlocks
}

/**
 * Determine whether the full voice profile should be injected for this selection.
 * Skip for non-dialogue short selections (action lines, brief parentheticals).
 */
export function shouldInjectProfile(selectedText: string, surroundingContext: string): boolean {
  // If it's very short and doesn't look like dialogue context, skip
  if (selectedText.length < 50) {
    // Check if any ALL CAPS character name appears nearby (dialogue indicator)
    const hasCharacterCue = /^[A-Z][A-Z0-9 ']+$/m.test(surroundingContext)
    return hasCharacterCue
  }
  return true
}
