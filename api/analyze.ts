/**
 * Vercel Serverless Function — Script Analysis Proxy
 *
 * Proxies analysis requests to the shared default using the user key or web server key.
 * Desktop uses user keys only.
 *
 * NOTE: This is a Serverless Function (NOT Edge) because analysis
 * can take 15-30 seconds, exceeding Edge's 25s timeout.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEFAULT_MODEL } from '../src/lib/models'
import { requestAnthropic } from './anthropic'
import { applyTesterToken } from './tester'

export const config = {
  maxDuration: 60,
}

const ANALYSIS_SYSTEM_PROMPT = `You are a screenplay dialogue analyst. You extract character voice profiles from Fountain-format screenplays. Your output is structured JSON only — no prose, no commentary.

Rules:
1. Every claim must cite evidence. For patterns, quote the exact dialogue line. For FORBIDDEN patterns, quote the line that proves the character NEVER uses that construction.
2. FORBIDDEN patterns are your highest-priority extraction. A FORBIDDEN pattern is a word, phrase, syntactic structure, or rhetorical device that a character demonstrably avoids across the entire script. Finding what a character does NOT say is more valuable than finding what they do say.
3. Voice convergence detection: If two or more characters share 3+ identical speech patterns with no distinguishing FORBIDDEN patterns between them, flag this in the convergence_warnings array.
4. Adapt to cast size:
   - 2 characters: Deep extraction. Maximize contrast between the two.
   - 3-6 characters: Standard extraction. Focus on top 3-4 most distinctive traits per character.
   - 7+ characters: Triage. Only profile characters with 5+ lines of dialogue. Group minor characters under ENSEMBLE_DEFAULT.
5. Stay under 4000 tokens total output.`

// Keep the Vercel Node contract and timeout; desktop calls this same request implementation.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await handleAnalysis(new Request('https://coil.local/api/analyze', {
    method: req.method,
    ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
  }))
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (req.method === 'OPTIONS') return res.status(response.status).end()
  return res.status(response.status).json(await response.json())
}

export async function handleAnalysis(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  let body
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { scriptContent } = body
  if (!scriptContent || typeof scriptContent !== 'string') {
    return Response.json({ error: 'Missing scriptContent field' }, { status: 400 })
  }
  const denied = applyTesterToken(body)
  if (denied) return denied
  const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'No Anthropic API key. Add one in Settings.' }, { status: 400 })

  // Rough token estimate — reject if too large
  const estimatedTokens = Math.ceil(scriptContent.length / 4)
  if (estimatedTokens > 900000) {
    return Response.json({ error: 'Script too large for analysis. Maximum ~900K tokens.' }, { status: 400 })
  }

  const userPrompt = `Analyze the following screenplay and return a JSON voice profile for each character.

For each character, extract:
1. FORBIDDEN_PATTERNS (most important): Words, phrases, or constructions this character never uses. Minimum 3 per character if 8+ lines.
2. VOCABULARY: Distinctive word choices. Quote the line.
3. SYNTAX: Sentence structure tendencies. Quote the line.
4. RHYTHM: Average sentence length bucket (terse/moderate/verbose). Quote the line.
5. RHETORIC: How they argue or persuade. Quote the line.
6. PROFANITY_REGISTER: None / mild / moderate / heavy.
7. FORMALITY_AXIS: street / casual / neutral / formal / ornate.

Return valid JSON: {"schema_version":"1.0.0","characters":[...],"convergence_warnings":[...]}
Each character object must have: name, forbidden_patterns, vocabulary, syntax, rhythm (with length_bucket and patterns), rhetoric, profanity_register, formality_axis.
Each pattern must have: pattern (string), evidence (quoted line).
No markdown fences.

<screenplay>
${scriptContent}
</screenplay>`

  try {
    const response = await requestAnthropic(ANALYSIS_SYSTEM_PROMPT, userPrompt, DEFAULT_MODEL.id, 16384, apiKey, req.signal)
    const data = await response.json()
    if (!response.ok) return Response.json({ error: `Anthropic ${response.status}: ${JSON.stringify(data)}` }, { status: response.status })
    const text = data.content?.filter((block: { type?: string; text?: string }) => block.text).map((block: { text: string }) => block.text).join('\n')
    if (!text) return Response.json({ error: 'Empty response from Anthropic' }, { status: 502 })
    return Response.json({ text })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 502 })
  }
}
