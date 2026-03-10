/**
 * Vercel Serverless Function — Script Analysis Proxy
 *
 * Proxies analysis requests to Gemini using server-side API key.
 * Used for "try free" mode when user has no Gemini key.
 *
 * NOTE: This is a Serverless Function (NOT Edge) because analysis
 * can take 15-30 seconds, exceeding Edge's 25s timeout.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'No Gemini API key configured on server' })
  }

  const { scriptContent } = req.body
  if (!scriptContent || typeof scriptContent !== 'string') {
    return res.status(400).json({ error: 'Missing scriptContent field' })
  }

  // Rough token estimate — reject if too large
  const estimatedTokens = Math.ceil(scriptContent.length / 4)
  if (estimatedTokens > 900000) {
    return res.status(400).json({ error: 'Script too large for analysis. Maximum ~900K tokens.' })
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
No markdown fences.

<screenplay>
${scriptContent}
</screenplay>`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      return res.status(geminiRes.status).json({ error: `Gemini ${geminiRes.status}: ${err}` })
    }

    const data = await geminiRes.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini' })
    }

    return res.status(200).json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: message })
  }
}
