/** Model IDs and defaults shared by the renderer and API handlers. */
export type AIProvider = 'anthropic' | 'openai' | 'google'
export interface AIModel {
  id: string
  name: string
  provider: AIProvider
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', provider: 'anthropic' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'anthropic' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai' },
]
export const DEFAULT_MODEL = AVAILABLE_MODELS[0]
export const DEFAULT_COMPARISON_MODEL = AVAILABLE_MODELS[4]

/** Proofreader model. Sonnet 5, not the cheaper Haiku 4.5: catching wrong-name and day/night errors needs
 *  cross-scene reading, and the verifier can discard hallucinations but cannot recover missed errors. */
export const PROOFREAD_MODEL = 'claude-sonnet-5'

export const OPTIONAL_GOOGLE_MODEL: AIModel = { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' }

export function selectableModels(googleKey: string): AIModel[] {
  return googleKey.trim() ? [...AVAILABLE_MODELS, OPTIONAL_GOOGLE_MODEL] : AVAILABLE_MODELS
}

export function currentModel(id: unknown, fallback = DEFAULT_MODEL, googleKey = ''): AIModel {
  return selectableModels(googleKey).find((model) => model.id === id) ?? fallback
}

/** USD per million tokens. Anthropic rows read from https://platform.claude.com/docs/en/about-claude/pricing on `pricedAt`
 *  (base input/output, no caching or batch). gpt-6-astra and Gemini are deliberately absent: no official price verified,
 *  so the UI shows tokens only for them. */
export const pricedAt = '2026-10-04'
export const MODEL_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-fable-5-1': { inputPerM: 10, outputPerM: 50 },
  'claude-opus-5-5': { inputPerM: 4, outputPerM: 20 },
  'claude-sonnet-5': { inputPerM: 2, outputPerM: 10 },
  'claude-haiku-4-5-20251001': { inputPerM: 1, outputPerM: 5 },
}

/** Estimated USD for one call, or null when the model has no verified price. */
export function estimateCostUSD(modelId: string, inputTokens: number, outputTokens: number): number | null {
  const price = MODEL_PRICES[modelId]
  if (!price) return null
  return (inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1_000_000
}
