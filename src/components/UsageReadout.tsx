import { formatTokens, formatUSD } from '../lib/usage'
import { useAIActivityStore } from '../store/ai-activity-store'

/** Per-call usage, plus a running total that survives restarts until reset (priced models only for dollars). */
export function UsageReadout() {
  const { lastCall, totalInput, totalOutput, totalCostUSD, totalUnpricedCalls, totalSince, resetTotal } =
    useAIActivityStore()
  if (!lastCall && totalInput + totalOutput === 0) return null

  const call = lastCall
    ? `in ${formatTokens(lastCall.inputTokens)} · out ${formatTokens(lastCall.outputTokens)}${
        lastCall.costUSD === null ? '' : ` · ≈${formatUSD(lastCall.costUSD)}`
      }`
    : null
  const since = new Date(totalSince).toLocaleDateString([], { month: 'short', day: 'numeric' })
  const tokens = `in ${formatTokens(totalInput)} · out ${formatTokens(totalOutput)}`
  // Models without a verified price add tokens but no dollars: never show $0.00 for them, flag mixed totals.
  const total =
    totalCostUSD > 0
      ? `≈${formatUSD(totalCostUSD)}${totalUnpricedCalls > 0 ? ' + unpriced calls' : ''} (${tokens})`
      : totalUnpricedCalls > 0
        ? `${tokens} (no verified price for these models)`
        : `≈${formatUSD(0)} (${tokens})`

  return (
    <span
      data-testid="usage-readout"
      title="Estimated from list prices. Requests that failed before a reply (for example a timeout) are not counted."
      style={{ fontSize: 'inherit', fontFamily: 'inherit', display: 'inline-flex', gap: '6px', alignItems: 'center' }}
    >
      {call && <>Last AI call: {call} |</>} AI spend since {since}: {total}
      <button
        type="button"
        onClick={resetTotal}
        title="Reset the running AI spend total"
        style={{
          background: 'none',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          color: 'inherit',
          font: 'inherit',
          padding: '0 4px',
          cursor: 'pointer',
        }}
      >
        reset
      </button>
    </span>
  )
}
