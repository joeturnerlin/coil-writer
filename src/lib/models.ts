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

export function currentModel(id: unknown, fallback = DEFAULT_MODEL): AIModel {
  return AVAILABLE_MODELS.find((model) => model.id === id) ?? fallback
}
