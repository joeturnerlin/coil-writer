/** Shared Messages transport for both Vercel handlers and the desktop bundle. */
export function requestAnthropic(
  system: string, user: string, model: string, maxTokens: number, apiKey: string, signal?: AbortSignal,
): Promise<Response> {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal,
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
}

export async function proxyAnthropic(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  clientKey?: string,
) {
  const apiKey = clientKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('No Anthropic API key configured', { status: 500 })
  }

  const res = await requestAnthropic(system, user, model, maxTokens, apiKey)

  const data = await res.json()
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Anthropic ${res.status}: ${JSON.stringify(data)}` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const text = data.content?.[0]?.text
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
