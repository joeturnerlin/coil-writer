import { useAIStore } from '../store/ai-store'
/** App wiring for the proofreader: routes model calls through dispatchAI (task 'proofread'). */
import { type AIDispatchOptions, dispatchAI } from './ai-dispatch'
import { AVAILABLE_MODELS, PROOFREAD_MODEL, estimateCostUSD } from './models'
import { type ModelCall, type ProofreadResult, estimateRun, runProofread } from './proofread-core'

export * from './proofread-core'

const model = AVAILABLE_MODELS.find((m) => m.id === PROOFREAD_MODEL)

export const proofreadCall: ModelCall = (args) => {
  const opts: AIDispatchOptions = {
    task: 'proofread',
    ...args,
    provider: model?.provider,
    model: PROOFREAD_MODEL,
    jsonMode: true,
  }
  return dispatchAI(opts)
}

export function runProofreadInApp(
  source: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<ProofreadResult> {
  return runProofread({ source, call: proofreadCall, signal, onProgress })
}

export function estimateProofreadCost(source: string) {
  const e = estimateRun(source)
  return { ...e, usd: estimateCostUSD(PROOFREAD_MODEL, e.inputTokens, e.outputTokens) }
}

export const NO_KEY_MESSAGE =
  'AI proofreading needs your Anthropic API key (Settings) or a Coil tester token. Rule checks below ran without it.'

/** A tester token is stored in the same slot as a provider key, so one lookup covers both. */
export function hasProofreadKey(): boolean {
  return Boolean(model && useAIStore.getState().apiKeys[model.provider]?.trim())
}

/** Plain-English text for a failed AI call; anything unrecognised keeps the server's own message. */
export function friendlyProofreadError(message: string, status: number | null): string {
  if (status === 401) return NO_KEY_MESSAGE
  if (status === 404) return "The proofreading service isn't reachable from this build."
  if (status === 0)
    return "You're offline or the connection dropped; rule checks still ran. If the request had already been sent, it may have been charged."
  if (status === 429) return 'Rate-limited; try again in a minute.'
  return `The check failed: ${message}`
}
