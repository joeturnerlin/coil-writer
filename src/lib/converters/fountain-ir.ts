import { classifyDocument } from '../../editor/fountain-decorations'
import { fountainToSpans, spansToFountain } from './inline-format'
import type { ConversionResult, ConversionWarning, ElementType, ScriptElement, ScriptIR, TitlePageField } from './types'

/**
 * Convert Fountain text to the intermediate representation.
 * Wraps the existing classifyDocument() parser.
 */
export function fountainToIR(text: string): ConversionResult {
  const classified = classifyDocument(text)
  const titlePage: TitlePageField[] = []
  const elements: ScriptElement[] = []
  const warnings: ConversionWarning[] = []

  let currentTitleKey: TitlePageField | null = null
  let seenNonTitle = false

  for (const line of classified) {
    const rawType = line.type

    // Title page handling
    if (!seenNonTitle && rawType === 'title-page-key') {
      const match = line.text.match(/^(\w[\w\s]*?):\s*(.*)$/)
      if (match) {
        currentTitleKey = { key: match[1].trim(), values: match[2].trim() ? [match[2].trim()] : [] }
        titlePage.push(currentTitleKey)
      }
      continue
    }
    if (!seenNonTitle && rawType === 'title-page-value') {
      if (currentTitleKey) {
        const trimmed = line.text.trim()
        if (trimmed) currentTitleKey.values.push(trimmed)
      }
      continue
    }

    // Skip page breaks that were title-page terminators
    if (!seenNonTitle && rawType === 'page-break' && titlePage.length > 0) {
      seenNonTitle = true
      continue
    }

    if (rawType !== 'blank' && rawType !== 'title-page-key' && rawType !== 'title-page-value') {
      seenNonTitle = true
    }

    currentTitleKey = null

    // Skip blank lines (we reconstruct them on output)
    if (rawType === 'blank') continue

    const type = rawType as ElementType
    let lineText = line.text
    let isDualDialogue = false

    // Detect dual dialogue marker (^ at end of character name)
    if (type === 'character' && lineText.trimEnd().endsWith('^')) {
      isDualDialogue = true
      lineText = lineText.trimEnd().slice(0, -1).trimEnd()
    }

    // Strip Fountain force markers for the IR
    if (type === 'scene-heading' && lineText.startsWith('.') && !/^\.\./.test(lineText)) {
      lineText = lineText.slice(1)
    }
    if (type === 'character' && lineText.startsWith('@')) {
      lineText = lineText.slice(1)
    }
    if (type === 'transition' && lineText.startsWith('>') && !lineText.endsWith('<')) {
      lineText = lineText.slice(1).trim()
    }
    if (type === 'centered-text' && lineText.startsWith('>') && lineText.endsWith('<')) {
      lineText = lineText.slice(1, -1).trim()
    }
    if (type === 'action' && lineText.startsWith('!')) {
      lineText = lineText.slice(1)
    }

    const { plainText, spans } = fountainToSpans(lineText)

    const element: ScriptElement = {
      type,
      text: plainText,
      ...(spans.length > 0 ? { spans } : {}),
      ...(isDualDialogue ? { isDualDialogue: true } : {}),
    }

    elements.push(element)
  }

  return {
    ir: {
      titlePage,
      elements,
      metadata: { sourceFormat: 'fountain' },
    },
    warnings,
  }
}

/**
 * Convert IR back to Fountain text.
 * Handles proper blank line insertion, force markers, and inline formatting.
 */
export function irToFountain(ir: ScriptIR): string {
  const lines: string[] = []

  // Title page
  if (ir.titlePage.length > 0) {
    for (const field of ir.titlePage) {
      if (field.values.length === 1) {
        lines.push(`${field.key}: ${field.values[0]}`)
      } else if (field.values.length > 1) {
        lines.push(`${field.key}:`)
        for (const v of field.values) {
          lines.push(`   ${v}`)
        }
      } else {
        lines.push(`${field.key}:`)
      }
    }
    lines.push('')
    lines.push('===')
    lines.push('')
  }

  let prevType: ElementType | null = null

  for (const el of ir.elements) {
    const text = el.spans ? spansToFountain(el.text, el.spans) : el.text

    // Add blank lines between elements where Fountain requires them
    if (prevType !== null) {
      const needsBlank =
        el.type === 'scene-heading' ||
        el.type === 'character' ||
        el.type === 'transition' ||
        el.type === 'centered-text' ||
        el.type === 'episode-boundary' ||
        el.type === 'killbox-section' ||
        el.type === 'page-break' ||
        el.type === 'general' ||
        el.type === 'boneyard' ||
        // Blank line before action that follows dialogue/parenthetical
        (el.type === 'action' && (prevType === 'dialogue' || prevType === 'parenthetical')) ||
        // Blank line between action blocks
        (el.type === 'action' && prevType === 'action')

      if (needsBlank) {
        lines.push('')
      }
    }

    // Apply force markers where needed
    switch (el.type) {
      case 'scene-heading': {
        const natural = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(text)
        lines.push(natural ? text : `.${text}`)
        break
      }
      case 'character': {
        const coreName = text.replace(/\s*\(.*\)$/, '')
        const natural =
          /^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(text) &&
          text.length < 50 &&
          !/^(INT|EXT|FADE|CUT|DISSOLVE|SMASH)/.test(text) &&
          !/[.!?]$/.test(coreName)
        let charLine = natural ? text : `@${text}`
        if (el.isDualDialogue) charLine += ' ^'
        lines.push(charLine)
        break
      }
      case 'transition': {
        const natural = /^(FADE|CUT|DISSOLVE|SMASH)/i.test(text) || /TO:$/i.test(text)
        lines.push(natural ? text : `> ${text}`)
        break
      }
      case 'centered-text':
        lines.push(`>${text}<`)
        break
      case 'page-break':
        lines.push('===')
        break
      case 'dialogue':
      case 'parenthetical':
      case 'action':
      case 'episode-boundary':
      case 'killbox-section':
      case 'boneyard':
      case 'general':
        lines.push(text)
        break
      default:
        lines.push(text)
    }

    prevType = el.type
  }

  return lines.join('\n') + '\n'
}
