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
