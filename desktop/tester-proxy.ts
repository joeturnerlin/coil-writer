import { isTesterToken } from '../api/tester'

export const TESTER_PROXY = 'https://coil-writer.vercel.app'

/** A `coil_…` tester token goes to the hosted handlers (which hold the real key); anything else stays local. */
export async function routeApi(req: Request, local: (req: Request) => Promise<Response>): Promise<Response> {
  const body = await req.clone().json().catch(() => null)
  if (!isTesterToken(body?.apiKey)) return local(req)
  const { pathname } = new URL(req.url)
  try {
    const r = await fetch(`${TESTER_PROXY}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(60000)]),
    })
    // Rebuild from the decoded text: fetch already decompressed the body, so forwarding content-encoding breaks decoding.
    const headers = new Headers()
    const type = r.headers.get('content-type')
    if (type) headers.set('content-type', type)
    return new Response(await r.text(), { status: r.status, headers })
  } catch (err) {
    // 504 is not retried by dispatchAI: the hosted call may still be running on the server key
    if (err instanceof DOMException && err.name === 'TimeoutError') return Response.json({ error: 'Tester proxy timed out' }, { status: 504 })
    return Response.json({ error: err instanceof Error ? err.message : 'Tester proxy request failed' }, { status: 502 })
  }
}
