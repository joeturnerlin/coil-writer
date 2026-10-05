import { formatTokens, formatUSD } from '../lib/usage'
import { useAIActivityStore } from '../store/ai-activity-store'

/** Per-call and session token usage with an estimated dollar figure (priced models only). */
export function UsageReadout() {
  const { lastCall, sessionInput, sessionOutput, sessionCostUSD, unpricedCalls } = useAIActivityStore()
  if (!lastCall) return null

  const call = `in ${formatTokens(lastCall.inputTokens)} · out ${formatTokens(lastCall.outputTokens)}${
    lastCall.costUSD === null ? '' : ` · ≈${formatUSD(lastCall.costUSD)}`
  }`
  const session = `in ${formatTokens(sessionInput)} · out ${formatTokens(sessionOutput)}${
    sessionCostUSD > 0 ? ` · ≈${formatUSD(sessionCostUSD)}` : ''
  }${unpricedCalls > 0 && sessionCostUSD > 0 ? ' + unpriced' : ''}`

  return (
    <span
      data-testid="usage-readout"
      title="Dollar figures are estimated from list prices; models without a verified price show tokens only."
      style={{ fontSize: '18px', fontFamily: 'inherit' }}
    >
      Last AI call: {call} | Session: {session} (estimated)
    </span>
  )
}
