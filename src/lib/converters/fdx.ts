import { fdxStylesToSpans, spansToFDXTextElements } from './inline-format'
import type {
  ConversionResult,
  ConversionWarning,
  ElementType,
  ExportResult,
  ScriptElement,
  ScriptIR,
  TitlePageField,
} from './types'

/** Map FDX Paragraph Type to IR ElementType */
const FDX_TYPE_MAP: Record<string, ElementType> = {
  'Scene Heading': 'scene-heading',
  Action: 'action',
  Character: 'character',
  Dialogue: 'dialogue',
  Parenthetical: 'parenthetical',
  Transition: 'transition',
  General: 'general',
  Shot: 'scene-heading',
  'Transition/': 'transition',
  'Cast List': 'general',
  Lyrics: 'dialogue',
}

/**
 * Import an FDX file (Final Draft XML) to IR.
 */
export async function importFDX(data: ArrayBuffer): Promise<ConversionResult> {
  const warnings: ConversionWarning[] = []

  // Detect encoding
  const xmlString = decodeXML(data)

  // Parse XML
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  // Check for parse errors
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return {
      ir: { titlePage: [], elements: [], metadata: { sourceFormat: 'fdx' } },
      warnings: [{ message: `XML parse error: ${parseError.textContent}`, severity: 'error' }],
    }
  }

  const root = doc.documentElement
  const version = root.getAttribute('Version') || undefined

  // Parse title page
  const titlePage = parseFDXTitlePage(doc)

  // Parse content
  const elements = parseFDXContent(doc, warnings)

  return {
    ir: {
      titlePage,
      elements,
      metadata: { sourceFormat: 'fdx', sourceVersion: version },
    },
    warnings,
  }
}

function decodeXML(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)

  // Check for UTF-16 BOM
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(data)
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(data)
  }

  // Default UTF-8
  return new TextDecoder('utf-8').decode(data)
}

function parseFDXTitlePage(doc: Document): TitlePageField[] {
  const titlePage: TitlePageField[] = []
  const tpElement = doc.querySelector('TitlePage')
  if (!tpElement) return titlePage

  const content = tpElement.querySelector('Content')
  if (!content) return titlePage

  const paragraphs = content.querySelectorAll('Paragraph')
  const blocks: string[][] = []
  let currentBlock: string[] = []

  for (const para of paragraphs) {
    const textContent = getParaText(para)
    if (textContent.trim() === '' && currentBlock.length > 0) {
      blocks.push(currentBlock)
      currentBlock = []
    } else if (textContent.trim() !== '') {
      currentBlock.push(textContent.trim())
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock)

  // Map blocks to title page fields by position
  const keyNames = ['Title', 'Credit', 'Author', 'Source', 'Draft date', 'Contact', 'Copyright']
  for (let i = 0; i < blocks.length; i++) {
    const key = i < keyNames.length ? keyNames[i] : `Field ${i + 1}`
    titlePage.push({ key, values: blocks[i] })
  }

  return titlePage
}

function parseFDXContent(doc: Document, warnings: ConversionWarning[]): ScriptElement[] {
  const elements: ScriptElement[] = []
  const content = doc.querySelector('FinalDraft > Content')
  if (!content) return elements

  let lineNum = 0
  for (const node of content.children) {
    lineNum++

    if (node.tagName === 'Paragraph') {
      const el = parseFDXParagraph(node, lineNum, warnings, false)
      if (el) elements.push(el)
    } else if (node.tagName === 'DualDialogue') {
      parseDualDialogue(node, elements, lineNum, warnings)
    }
  }

  return elements
}

function parseFDXParagraph(
  para: Element,
  lineNum: number,
  warnings: ConversionWarning[],
  isDualRight: boolean,
): ScriptElement | null {
  const fdxType = para.getAttribute('Type') || 'Action'
  const type = FDX_TYPE_MAP[fdxType]

  if (!type) {
    warnings.push({
      line: lineNum,
      element: fdxType,
      message: `Unknown FDX paragraph type "${fdxType}" — converted to action`,
      severity: 'warning',
    })
  }

  // Extract Text elements with styles
  const textElements: Array<{ text: string; style?: string }> = []
  for (const textNode of para.querySelectorAll(':scope > Text')) {
    textElements.push({
      text: textNode.textContent || '',
      style: textNode.getAttribute('Style') || undefined,
    })
  }

  if (textElements.length === 0) return null

  const { plainText, spans } = fdxStylesToSpans(textElements)
  if (plainText.trim() === '') return null

  // Scene number
  const sceneProps = para.querySelector('SceneProperties')
  const sceneNumber = sceneProps?.getAttribute('Number') || undefined

  // Script notes
  const noteElements = para.querySelectorAll('ScriptNote')
  const notes = Array.from(noteElements)
    .map((n) => ({
      text: n.textContent?.trim() || '',
      position: 0,
    }))
    .filter((n) => n.text)

  if (notes.length > 0) {
    warnings.push({
      line: lineNum,
      message: `${notes.length} script note(s) converted to inline notes`,
      severity: 'info',
    })
  }

  const element: ScriptElement = {
    type: type || 'action',
    text: plainText,
    ...(spans.length > 0 ? { spans } : {}),
    ...(sceneNumber ? { sceneNumber } : {}),
    ...(isDualRight ? { isDualDialogue: true, dualDialoguePosition: 'right' as const } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  }

  return element
}

function parseDualDialogue(dd: Element, elements: ScriptElement[], lineNum: number, warnings: ConversionWarning[]) {
  const paragraphs = dd.querySelectorAll('Paragraph')
  let foundFirstCharacter = false
  let isSecondCharacter = false

  for (const para of paragraphs) {
    const fdxType = para.getAttribute('Type') || ''

    if (fdxType === 'Character') {
      if (foundFirstCharacter) {
        isSecondCharacter = true
      }
      foundFirstCharacter = true
    }

    const el = parseFDXParagraph(para, lineNum, warnings, isSecondCharacter)
    if (el) {
      elements.push(el)
    }
  }
}

function getParaText(para: Element): string {
  return Array.from(para.querySelectorAll('Text'))
    .map((t) => t.textContent || '')
    .join('')
}

// ── FDX Export ──────────────────────────────────────────────────────

/** Map IR ElementType back to FDX Paragraph Type */
const IR_TO_FDX_TYPE: Record<string, string> = {
  'scene-heading': 'Scene Heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  'centered-text': 'Action',
  general: 'General',
  'episode-boundary': 'General',
  'killbox-section': 'General',
  boneyard: 'General',
}

/**
 * Export IR to FDX (Final Draft XML format).
 * Clean export — standard elements + title page + inline formatting.
 */
export async function exportFDX(ir: ScriptIR): Promise<ExportResult> {
  const warnings: ConversionWarning[] = []

  const doc = document.implementation.createDocument(null, 'FinalDraft', null)
  const root = doc.documentElement
  root.setAttribute('DocumentType', 'Script')
  root.setAttribute('Template', 'No')
  root.setAttribute('Version', '4')

  // Title page
  if (ir.titlePage.length > 0) {
    const tp = doc.createElement('TitlePage')
    const tpContent = doc.createElement('Content')

    for (const field of ir.titlePage) {
      for (const value of field.values) {
        const para = doc.createElement('Paragraph')
        const textEl = doc.createElement('Text')
        textEl.textContent = value
        para.appendChild(textEl)
        tpContent.appendChild(para)
      }
      // Empty paragraph as separator between fields
      const sep = doc.createElement('Paragraph')
      const sepText = doc.createElement('Text')
      sepText.textContent = ''
      sep.appendChild(sepText)
      tpContent.appendChild(sep)
    }

    tp.appendChild(tpContent)
    root.appendChild(tp)
  }

  // Content
  const content = doc.createElement('Content')
  let i = 0

  while (i < ir.elements.length) {
    const el = ir.elements[i]

    // Check for dual dialogue
    if (el.type === 'character' && hasDualDialogueAhead(ir.elements, i)) {
      const ddEl = doc.createElement('DualDialogue')
      // First character block
      i = appendCharacterBlock(doc, ddEl, ir.elements, i)
      // Second character block (with isDualDialogue flag)
      if (i < ir.elements.length && ir.elements[i].type === 'character') {
        i = appendCharacterBlock(doc, ddEl, ir.elements, i)
      }
      content.appendChild(ddEl)
      continue
    }

    // Warn about Recoil-specific elements
    if (el.type === 'episode-boundary' || el.type === 'killbox-section') {
      warnings.push({
        element: el.type,
        message: `${el.type} exported as General paragraph — appears as plain text in Final Draft`,
        severity: 'warning',
      })
    }

    const para = createFDXParagraph(doc, el)
    content.appendChild(para)
    i++
  }

  root.appendChild(content)

  // Serialize
  const serializer = new XMLSerializer()
  let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xmlString += serializer.serializeToString(doc)

  const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' })

  return {
    data: blob,
    mimeType: 'application/xml',
    extension: '.fdx',
    warnings,
  }
}

function createFDXParagraph(doc: Document, el: ScriptElement): Element {
  const para = doc.createElement('Paragraph')
  const fdxType = IR_TO_FDX_TYPE[el.type] || 'Action'
  para.setAttribute('Type', fdxType)

  const textElements = el.spans ? spansToFDXTextElements(el.text, el.spans) : [{ text: el.text }]

  for (const te of textElements) {
    const textEl = doc.createElement('Text')
    textEl.textContent = te.text
    if (te.style) {
      textEl.setAttribute('Style', te.style)
    }
    para.appendChild(textEl)
  }

  return para
}

function hasDualDialogueAhead(elements: ScriptElement[], fromIndex: number): boolean {
  for (let j = fromIndex + 1; j < elements.length && j < fromIndex + 10; j++) {
    if (elements[j].type === 'character' && elements[j].isDualDialogue) return true
    if (elements[j].type === 'scene-heading' || elements[j].type === 'action') return false
  }
  return false
}

function appendCharacterBlock(doc: Document, parent: Element, elements: ScriptElement[], startIndex: number): number {
  let i = startIndex
  const charPara = createFDXParagraph(doc, elements[i])
  parent.appendChild(charPara)
  i++

  while (i < elements.length && (elements[i].type === 'dialogue' || elements[i].type === 'parenthetical')) {
    const para = createFDXParagraph(doc, elements[i])
    parent.appendChild(para)
    i++
  }

  return i
}
