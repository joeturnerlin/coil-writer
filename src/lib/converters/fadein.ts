import { fdxStylesToSpans } from './inline-format'
import type { ConversionResult, ConversionWarning, ElementType, ScriptElement, TitlePageField } from './types'

const FADEIN_TYPE_MAP: Record<string, ElementType> = {
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  general: 'general',
  shot: 'scene-heading',
}

/**
 * Import a Fade In (.fadein) file — ZIP containing document.xml.
 */
export async function importFadeIn(data: ArrayBuffer): Promise<ConversionResult> {
  const JSZip = (await import('jszip')).default
  const warnings: ConversionWarning[] = []

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'fadein' } },
      warnings: [{ message: 'Failed to read .fadein archive — file may be corrupt', severity: 'error' }],
    }
  }

  const docFile = zip.file('document.xml')
  if (!docFile) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'fadein' } },
      warnings: [{ message: 'No document.xml found in .fadein archive', severity: 'error' }],
    }
  }

  const xmlText = await docFile.async('string')
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'fadein' } },
      warnings: [{ message: `XML parse error in document.xml: ${parseError.textContent?.slice(0, 200)}`, severity: 'error' }],
    }
  }

  const titlePage: TitlePageField[] = []
  const elements: ScriptElement[] = []

  // Parse title page
  const tpEl = doc.querySelector('titlepage')
  if (tpEl) {
    for (const child of tpEl.children) {
      if (child.tagName.toLowerCase() === 'para') {
        const key = child.getAttribute('type') || 'Title'
        const text = child.textContent?.trim() || ''
        if (text) {
          titlePage.push({ key: capitalize(key.replace(/_/g, ' ')), values: [text] })
        }
      }
    }
  }

  // Parse content paragraphs
  const textEl = doc.querySelector('text')
  if (textEl) {
    let lineNum = 0
    for (const para of textEl.querySelectorAll('para')) {
      lineNum++
      const typeAttr = para.getAttribute('type') || 'action'
      const type = FADEIN_TYPE_MAP[typeAttr.toLowerCase()]

      if (!type) {
        warnings.push({
          line: lineNum,
          message: `Unknown Fade In type "${typeAttr}" — converted to action`,
          severity: 'warning',
        })
      }

      // Extract styled text
      const styleElements = para.querySelectorAll('style')
      const textParts: Array<{ text: string; style?: string }> = []

      if (styleElements.length > 0) {
        for (const s of styleElements) {
          const font = s.getAttribute('font') || ''
          let style: string | undefined
          if (font.includes('Bold') && font.includes('Italic')) style = 'Bold+Italic'
          else if (font.includes('Bold')) style = 'Bold'
          else if (font.includes('Italic')) style = 'Italic'
          textParts.push({ text: s.textContent || '', style })
        }
      } else {
        textParts.push({ text: para.textContent || '' })
      }

      const { plainText, spans } = fdxStylesToSpans(textParts)
      if (plainText.trim() === '') continue

      elements.push({
        type: type || 'action',
        text: plainText,
        ...(spans.length > 0 ? { spans } : {}),
      })
    }
  }

  return {
    ir: { titlePage, elements, metadata: { sourceFormat: 'fadein' } },
    warnings,
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
