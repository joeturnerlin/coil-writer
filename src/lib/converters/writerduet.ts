import type { ConversionResult, ConversionWarning, ElementType, ScriptElement } from './types'

const WD_TYPE_MAP: Record<string, ElementType> = {
  'scene heading': 'scene-heading',
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  general: 'general',
}

/**
 * Import a WriterDuet (.wdz) file — ZIP containing script.json.
 */
export async function importWriterDuet(data: ArrayBuffer): Promise<ConversionResult> {
  const JSZip = (await import('jszip')).default
  const warnings: ConversionWarning[] = []

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'writerduet' } },
      warnings: [{ message: 'Failed to read .wdz archive — file may be corrupt', severity: 'error' }],
    }
  }

  // Look for script.json or any JSON file
  let scriptJson: string | null = null
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    if (path === 'script.json' || path.endsWith('.json')) {
      scriptJson = await file.async('string')
      break
    }
  }

  if (!scriptJson) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'writerduet' } },
      warnings: [{ message: 'No script.json found in WriterDuet archive', severity: 'error' }],
    }
  }

  let scriptData: unknown
  try {
    scriptData = JSON.parse(scriptJson)
  } catch {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'writerduet' } },
      warnings: [{ message: 'Failed to parse script.json — invalid JSON', severity: 'error' }],
    }
  }

  const elements: ScriptElement[] = []

  // WriterDuet JSON structure: { scenes: [{ elements: [{ type, text }] }] }
  const obj = scriptData as Record<string, unknown>
  const scenes = obj?.scenes as Array<Record<string, unknown>> | undefined

  if (Array.isArray(scenes)) {
    for (const scene of scenes) {
      const sceneElements = scene.elements as Array<Record<string, string>> | undefined
      if (!Array.isArray(sceneElements)) continue

      for (const el of sceneElements) {
        const typeStr = (el.type || 'action').toLowerCase()
        const type = WD_TYPE_MAP[typeStr]

        if (!type) {
          warnings.push({
            message: `Unknown WriterDuet type "${typeStr}" — converted to action`,
            severity: 'warning',
          })
        }

        const text = el.text || ''
        if (text.trim() === '') continue

        elements.push({ type: type || 'action', text })
      }
    }
  } else {
    warnings.push({
      message: 'Unexpected WriterDuet JSON structure — no scenes array found',
      severity: 'warning',
    })
    // Try flat elements array
    const flatElements = obj?.elements as Array<Record<string, string>> | undefined
    if (Array.isArray(flatElements)) {
      for (const el of flatElements) {
        const text = el.text || el.content || ''
        if (text.trim() === '') continue
        elements.push({ type: 'action', text })
      }
    }
  }

  return {
    ir: { titlePage: [], elements, metadata: { sourceFormat: 'writerduet' } },
    warnings,
  }
}
