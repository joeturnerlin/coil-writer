/**
 * Structure Analysis — AI-powered beat mapping.
 *
 * Maps scenes to framework beats (Save the Cat, Hero's Journey, etc.)
 * and detects structural gaps where expected beats are missing.
 */

import { dispatchAI } from './ai-dispatch'
import type { SceneBlock } from './scene-model'

export interface BeatMapping {
  sceneIndex: number
  beatId: string
  confidence: number
  summary: string
}

export interface GapWarning {
  beatId: string
  beatName: string
  expectedPosition: number
  message: string
}

export interface StructureResult {
  mappings: BeatMapping[]
  gaps: GapWarning[]
}

interface FrameworkBeat {
  id: string
  name: string
  typical_position: number
  position_tolerance: number
  color: string
  category: string
  description: string
}

interface Framework {
  id: string
  name: string
  author: string
  beats: FrameworkBeat[]
}

/**
 * Analyze a script's structure against a narrative framework.
 *
 * Sends scene headings + summaries to AI, receives beat mappings,
 * then detects gaps where expected beats are missing.
 */
export async function analyzeStructure(
  scenes: SceneBlock[],
  frameworkId: string,
  signal?: AbortSignal,
): Promise<StructureResult> {
  // Dynamic import of framework JSON
  const fw: Framework = (await import(`./frameworks/${frameworkId}.json`)).default

  // Build scene summaries: heading + first 2 content lines
  const sceneSummaries = scenes
    .filter((s) => s.heading)
    .map((s) => {
      const contentLines = s.content.split('\n').filter((l) => l.trim())
      const preview = contentLines.slice(0, 2).join(' ').trim()
      return `Scene ${s.index}: ${s.heading}\n  ${preview}`
    })
    .join('\n')

  // Build beat reference
  const beatRef = fw.beats
    .map((b) => `- ${b.id}: "${b.name}" (~${Math.round(b.typical_position * 100)}%) — ${b.description}`)
    .join('\n')

  const systemPrompt = [
    `You are a screenplay structure analyst using the "${fw.name}" framework by ${fw.author}.`,
    'Map each scene to 0 or 1 framework beat. Return JSON with a mappings array.',
    'Each mapping: { "sceneIndex": number, "beatId": string, "confidence": 0-1, "summary": string }.',
    'Include a 1-2 sentence summary of each scene.',
    'A scene may map to no beat (omit it). A beat may map to 0 or 1 scene.',
    'Only output valid JSON. No markdown fences.',
  ].join(' ')

  const userPrompt = [
    `Framework beats:\n${beatRef}`,
    '',
    `Scenes:\n${sceneSummaries}`,
    '',
    'Return: { "mappings": [...] }',
  ].join('\n')

  const result = await dispatchAI({
    task: 'structure',
    systemPrompt,
    userPrompt,
    jsonMode: true,
    signal,
  })

  // Parse AI response
  if (!result.text) {
    throw new Error('Empty response from structure analysis')
  }

  let parsed: { mappings: BeatMapping[] }
  try {
    parsed = JSON.parse(result.text)
  } catch {
    // Try to extract JSON from response if wrapped in markdown
    const match = result.text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        throw new Error('Failed to parse structure analysis response')
      }
    } else {
      throw new Error('Failed to parse structure analysis response')
    }
  }

  const mappings: BeatMapping[] = (parsed.mappings || []).map((m) => ({
    sceneIndex: m.sceneIndex,
    beatId: m.beatId,
    confidence: Math.max(0, Math.min(1, m.confidence)),
    summary: m.summary || '',
  }))

  // Gap detection: find framework beats not covered by any mapping
  const mappedBeatIds = new Set(mappings.map((m) => m.beatId))
  const gaps: GapWarning[] = fw.beats
    .filter((b) => !mappedBeatIds.has(b.id))
    .map((b) => ({
      beatId: b.id,
      beatName: b.name,
      expectedPosition: b.typical_position,
      message: `Missing: ${b.name} — expected ~${Math.round(b.typical_position * 100)}%`,
    }))

  return { mappings, gaps }
}
