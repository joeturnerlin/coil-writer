import { isTesterToken } from '../api/tester'

export const TESTER_PROXY = 'https://coil-writer.vercel.app'

/** A `coil_…` tester token goes to the hosted handlers (which hold the real key); anything else stays local. */
export async function routeApi(req: Request, local: (req: Request) => Promise<Response>): Promise<Response> {
  const body = await req.clone().json().catch(() => null)
  if (!isTesterToken(body?.apiKey)) return local(req)
  const { pathname } = new URL(req.url)
  return fetch(`${TESTER_PROXY}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: req.signal })
}
