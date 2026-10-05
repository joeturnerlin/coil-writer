/** Tester tokens: a revocable `coil_…` token stands in for a provider key so the real key stays server-side. */
const PREFIX = 'coil_'

export const isTesterToken = (key?: string): key is string => Boolean(key?.startsWith(PREFIX))

/** Swaps a valid tester token in `body.apiKey` for the server's key; returns an error Response if it can't. */
export function applyTesterToken(body: { provider?: string; apiKey?: string }): Response | null {
  if (!isTesterToken(body.apiKey)) return null
  const valid = (process.env.COIL_TESTER_TOKENS ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  if (!valid.includes(body.apiKey)) return Response.json({ error: 'Invalid tester token' }, { status: 401 })
  const provider = body.provider ?? 'anthropic'
  const serverKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'openai' ? process.env.OPENAI_API_KEY : undefined
  if (!serverKey) return Response.json({ error: `Tester access is not available for ${provider}` }, { status: 400 })
  body.apiKey = serverKey
  return null
}
