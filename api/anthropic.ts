import { parseAnthropicUsage } from '../src/lib/usage'

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

interface AnthropicContent { content?: Array<{ type?: string; text?: string }> }

/** Text of an Anthropic Messages response, skipping non-text blocks (e.g. thinking).
 *  `joinAll` joins every text block (analysis); otherwise only the first (proxy routes, one JSON answer). */
export function extractAnthropicText(data: AnthropicContent, joinAll = false): string {
  const texts = (data.content ?? []).filter((block) => block.text).map((block) => block.text as string)
  return joinAll ? texts.join('\n') : (texts[0] ?? '')
}

export async function proxyAnthropic(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  clientKey?: string,
) {
  const apiKey = clientKey
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

  const text = extractAnthropicText(data)
  if (!text) {
    return new Response(JSON.stringify({ error: 'Empty response from Anthropic' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ text, usage: parseAnthropicUsage(data) }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
