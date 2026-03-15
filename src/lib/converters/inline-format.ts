import type { InlineSpan, InlineStyle } from './types'

/**
 * Parse Fountain inline formatting markers into plain text + spans.
 * Handles: **bold**, *italic*, _underline_, and nested combinations.
 */
export function fountainToSpans(text: string): { plainText: string; spans: InlineSpan[] } {
  const spans: InlineSpan[] = []
  let plain = ''
  let i = 0

  while (i < text.length) {
    // Bold+Italic: ***text***
    if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '*') {
      const end = text.indexOf('***', i + 3)
      if (end !== -1) {
        const from = plain.length
        const content = text.slice(i + 3, end)
        plain += content
        spans.push({ from, to: plain.length, style: 'bold-italic' })
        i = end + 3
        continue
      }
    }
    // Bold: **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        const from = plain.length
        const content = text.slice(i + 2, end)
        plain += content
        spans.push({ from, to: plain.length, style: 'bold' })
        i = end + 2
        continue
      }
    }
    // Italic: *text* (not **)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && text[end + 1] !== '*') {
        const from = plain.length
        const content = text.slice(i + 1, end)
        plain += content
        spans.push({ from, to: plain.length, style: 'italic' })
        i = end + 1
        continue
      }
    }
    // Underline: _text_
    if (text[i] === '_') {
      const end = text.indexOf('_', i + 1)
      if (end !== -1) {
        const from = plain.length
        const content = text.slice(i + 1, end)
        plain += content
        spans.push({ from, to: plain.length, style: 'underline' })
        i = end + 1
        continue
      }
    }
    plain += text[i]
    i++
  }

  return { plainText: plain, spans }
}

/**
 * Convert plain text + spans back to Fountain-formatted text.
 */
export function spansToFountain(text: string, spans: InlineSpan[]): string {
  if (!spans || spans.length === 0) return text

  const sorted = [...spans].sort((a, b) => a.from - b.from || b.to - a.to)
  let result = ''
  let pos = 0

  for (const span of sorted) {
    result += text.slice(pos, span.from)
    const content = text.slice(span.from, span.to)
    const [open, close] = getMarkers(span.style)
    result += open + content + close
    pos = span.to
  }

  result += text.slice(pos)
  return result
}

function getMarkers(style: InlineStyle): [string, string] {
  switch (style) {
    case 'bold':
      return ['**', '**']
    case 'italic':
      return ['*', '*']
    case 'underline':
      return ['_', '_']
    case 'bold-italic':
      return ['***', '***']
    case 'bold-underline':
      return ['**_', '_**']
    case 'italic-underline':
      return ['*_', '_*']
    case 'bold-italic-underline':
      return ['***_', '_***']
  }
}

/**
 * Parse FDX Text elements (with Style attributes) into plain text + spans.
 */
export function fdxStylesToSpans(textElements: Array<{ text: string; style?: string }>): {
  plainText: string
  spans: InlineSpan[]
} {
  const spans: InlineSpan[] = []
  let plain = ''

  for (const el of textElements) {
    if (el.style && el.style !== '') {
      const from = plain.length
      plain += el.text
      const style = parseFDXStyle(el.style)
      if (style) {
        spans.push({ from, to: plain.length, style })
      }
    } else {
      plain += el.text
    }
  }

  return { plainText: plain, spans }
}

/**
 * Convert spans back to FDX Text elements.
 */
export function spansToFDXTextElements(text: string, spans: InlineSpan[]): Array<{ text: string; style?: string }> {
  if (!spans || spans.length === 0) {
    return [{ text }]
  }

  const sorted = [...spans].sort((a, b) => a.from - b.from)
  const elements: Array<{ text: string; style?: string }> = []
  let pos = 0

  for (const span of sorted) {
    if (span.from > pos) {
      elements.push({ text: text.slice(pos, span.from) })
    }
    elements.push({
      text: text.slice(span.from, span.to),
      style: toFDXStyle(span.style),
    })
    pos = span.to
  }

  if (pos < text.length) {
    elements.push({ text: text.slice(pos) })
  }

  return elements
}

function parseFDXStyle(style: string): InlineStyle | null {
  const parts = style.split('+').map((s) => s.trim().toLowerCase())
  const has = (s: string) => parts.includes(s)
  const bold = has('bold')
  const italic = has('italic')
  const underline = has('underline')

  if (bold && italic && underline) return 'bold-italic-underline'
  if (bold && italic) return 'bold-italic'
  if (bold && underline) return 'bold-underline'
  if (italic && underline) return 'italic-underline'
  if (bold) return 'bold'
  if (italic) return 'italic'
  if (underline) return 'underline'
  return null
}

function toFDXStyle(style: InlineStyle): string {
  switch (style) {
    case 'bold':
      return 'Bold'
    case 'italic':
      return 'Italic'
    case 'underline':
      return 'Underline'
    case 'bold-italic':
      return 'Bold+Italic'
    case 'bold-underline':
      return 'Bold+Underline'
    case 'italic-underline':
      return 'Italic+Underline'
    case 'bold-italic-underline':
      return 'Bold+Italic+Underline'
  }
}
