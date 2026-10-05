/** Token usage normalization shared by the api/ handlers (which put `usage` on the wire) and the direct client paths. */

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/** Anthropic Messages: usage.input_tokens / output_tokens. */
export function parseAnthropicUsage(data: unknown): TokenUsage | undefined {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage
  if (!u || typeof u !== 'object') return undefined
  return { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) }
}

/** OpenAI chat completions: usage.prompt_tokens / completion_tokens. */
export function parseOpenAIUsage(data: unknown): TokenUsage | undefined {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage
  if (!u || typeof u !== 'object') return undefined
  return { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens) }
}

/** Gemini generateContent: usageMetadata; thinking tokens are billed as output. */
export function parseGeminiUsage(data: unknown): TokenUsage | undefined {
  const u = (data as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata
  if (!u || typeof u !== 'object') return undefined
  return { inputTokens: num(u.promptTokenCount), outputTokens: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount) }
}

/** Validates the `usage` field of a proxy response body. */
export function usageFromWire(value: unknown): TokenUsage | undefined {
  const u = value as Partial<TokenUsage> | null | undefined
  if (!u || typeof u !== 'object') return undefined
  if (typeof u.inputTokens !== 'number' || typeof u.outputTokens !== 'number') return undefined
  return { inputTokens: num(u.inputTokens), outputTokens: num(u.outputTokens) }
}

export function formatTokens(n: number): string {
  return n < 1000 ? String(Math.round(n)) : `${(n / 1000).toFixed(1)}k`
}

export function formatUSD(n: number): string {
  return n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`
}
