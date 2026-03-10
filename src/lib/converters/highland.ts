import { fountainToIR } from './fountain-ir'
import type { ConversionResult } from './types'

/**
 * Import a Highland (.highland) file — ZIP containing content.fountain + metadata.json.
 * Highland is Fountain in a ZIP, so we extract and parse normally.
 */
export async function importHighland(data: ArrayBuffer): Promise<ConversionResult> {
  const JSZip = (await import('jszip')).default

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'highland' } },
      warnings: [{ message: 'Failed to read .highland archive — file may be corrupt', severity: 'error' }],
    }
  }

  // Look for the Fountain content file
  let fountainContent: string | null = null
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    if (path.endsWith('.fountain') || path === 'content.fountain') {
      fountainContent = await file.async('string')
      break
    }
  }

  if (!fountainContent) {
    // Try any .txt file
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      if (path.endsWith('.txt')) {
        fountainContent = await file.async('string')
        break
      }
    }
  }

  if (!fountainContent) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'highland' } },
      warnings: [{ message: 'No .fountain file found in Highland archive', severity: 'error' }],
    }
  }

  const result = fountainToIR(fountainContent)
  result.ir.metadata.sourceFormat = 'highland'
  return result
}
