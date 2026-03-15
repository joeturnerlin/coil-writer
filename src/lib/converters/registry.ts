import { exportFDX, importFDX } from './fdx'
import { fountainToIR, irToFountain } from './fountain-ir'
import type { ConversionResult, ConversionWarning, ExportResult, FormatDescriptor, FormatId, ScriptIR } from './types'

export const FORMAT_DESCRIPTORS: FormatDescriptor[] = [
  { id: 'fountain', name: 'Fountain', extensions: ['.fountain', '.txt'], canImport: true, canExport: true },
  { id: 'fdx', name: 'Final Draft', extensions: ['.fdx'], canImport: true, canExport: true },
  { id: 'fadein', name: 'Fade In', extensions: ['.fadein'], canImport: true, canExport: false },
  { id: 'highland', name: 'Highland', extensions: ['.highland'], canImport: true, canExport: false },
  { id: 'writerduet', name: 'WriterDuet', extensions: ['.wdz'], canImport: true, canExport: false },
  { id: 'celtx', name: 'Celtx', extensions: ['.celtx'], canImport: true, canExport: false },
]

/** All accepted file extensions for the file picker */
export const ALL_EXTENSIONS = FORMAT_DESCRIPTORS.flatMap((f) => f.extensions).join(',')

/** Formats that can be exported */
export const EXPORTABLE_FORMATS = FORMAT_DESCRIPTORS.filter((f) => f.canExport)

/**
 * Detect format from file name and/or content.
 */
export function detectFormat(fileName: string, data: ArrayBuffer): FormatId {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))

  // Extension-based detection
  for (const desc of FORMAT_DESCRIPTORS) {
    if (desc.extensions.includes(ext)) return desc.id
  }

  // Content sniffing
  const bytes = new Uint8Array(data.slice(0, 4))

  // ZIP magic bytes: PK\x03\x04
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // It's a ZIP — try to determine from extension
    if (ext === '.fadein') return 'fadein'
    if (ext === '.highland') return 'highland'
    if (ext === '.wdz') return 'writerduet'
    if (ext === '.celtx') return 'celtx'
    return 'fadein'
  }

  // Check for XML (FDX)
  const textStart = new TextDecoder('utf-8').decode(data.slice(0, 512))
  if (textStart.includes('<FinalDraft') || (textStart.includes('<?xml') && textStart.includes('FinalDraft'))) {
    return 'fdx'
  }

  // Default to Fountain
  return 'fountain'
}

/**
 * Import a file in any supported format.
 * Returns Fountain text content + any warnings.
 */
export async function importFile(
  fileName: string,
  data: ArrayBuffer,
): Promise<{ content: string; warnings: ConversionWarning[]; format: FormatId }> {
  const format = detectFormat(fileName, data)

  if (format === 'fountain') {
    const content = new TextDecoder('utf-8').decode(data)
    return { content, warnings: [], format }
  }

  let result: ConversionResult

  switch (format) {
    case 'fdx':
      result = await importFDX(data)
      break
    case 'fadein': {
      const mod = await import('./fadein')
      result = await mod.importFadeIn(data)
      break
    }
    case 'highland': {
      const mod = await import('./highland')
      result = await mod.importHighland(data)
      break
    }
    case 'writerduet': {
      const mod = await import('./writerduet')
      result = await mod.importWriterDuet(data)
      break
    }
    case 'celtx': {
      const mod = await import('./celtx')
      result = await mod.importCeltx(data)
      break
    }
    default: {
      const content = new TextDecoder('utf-8').decode(data)
      return {
        content,
        warnings: [{ message: `Format "${format}" not yet supported — opened as plain text`, severity: 'warning' }],
        format: 'fountain',
      }
    }
  }

  const content = irToFountain(result.ir)
  return { content, warnings: result.warnings, format }
}

/**
 * Export content to a specific format.
 */
export async function exportFile(content: string, format: FormatId, _fileName: string): Promise<ExportResult> {
  if (format === 'fdx') {
    const { ir } = fountainToIR(content)
    return exportFDX(ir)
  }

  // Default: Fountain export
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  return {
    data: blob,
    mimeType: 'text/plain',
    extension: '.fountain',
    warnings: [],
  }
}
