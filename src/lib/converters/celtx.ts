import type { ConversionResult, ConversionWarning, ElementType, ScriptElement } from './types'

const CELTX_CLASS_MAP: Record<string, ElementType> = {
  sceneheading: 'scene-heading',
  'scene-heading': 'scene-heading',
  action: 'action',
  character: 'character',
  dialog: 'dialogue',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  shot: 'scene-heading',
}

/**
 * Import a Celtx (.celtx) file — ZIP containing HTML files with CSS classes.
 */
export async function importCeltx(data: ArrayBuffer): Promise<ConversionResult> {
  const JSZip = (await import('jszip')).default
  const warnings: ConversionWarning[] = []

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'celtx' } },
      warnings: [{ message: 'Failed to read .celtx archive — file may be corrupt', severity: 'error' }],
    }
  }

  // Look for the script HTML file
  let htmlContent: string | null = null
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      htmlContent = await file.async('string')
      break
    }
  }

  if (!htmlContent) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'celtx' } },
      warnings: [{ message: 'No HTML file found in Celtx archive', severity: 'error' }],
    }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const elements: ScriptElement[] = []

  // Celtx uses <p class="sceneheading">, <p class="action">, etc.
  const paragraphs = doc.querySelectorAll('p[class], div[class]')

  let lineNum = 0
  for (const para of paragraphs) {
    lineNum++
    const className = para.className.toLowerCase().trim()
    const text = para.textContent?.trim() || ''
    if (!text) continue

    // Try to match class name to element type
    let type: ElementType | null = null
    for (const [cls, elType] of Object.entries(CELTX_CLASS_MAP)) {
      if (className.includes(cls)) {
        type = elType
        break
      }
    }

    if (!type) {
      if (className) {
        warnings.push({
          line: lineNum,
          message: `Unknown Celtx class "${className}" — converted to action`,
          severity: 'warning',
        })
      }
      type = 'action'
    }

    elements.push({ type, text })
  }

  // If no class-tagged elements found, try line-by-line from body text
  if (elements.length === 0) {
    const body = doc.body
    if (body) {
      const text = body.textContent || ''
      const textLines = text.split('\n').filter((l) => l.trim())
      for (const line of textLines) {
        elements.push({ type: 'action', text: line.trim() })
      }
      if (textLines.length > 0) {
        warnings.push({ message: 'No CSS-classed elements found — imported as plain text', severity: 'warning' })
      }
    }
  }

  return {
    ir: { titlePage: [], elements, metadata: { sourceFormat: 'celtx' } },
    warnings,
  }
}
