import type { Annotation } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { downloadFile } from './file-io'
import { anchorAnnotation } from './note-transfer'

function exportAnchor(a: Annotation, content: string | null, fileName: string, placed: boolean) {
  // A placed note's anchors come from where it sits NOW; a note still waiting to be placed keeps the ones it arrived with.
  const derived = content !== null && placed && a.from < a.to ? anchorAnnotation(a, content, fileName) : null
  return {
    anchorHeading: derived?.anchorHeading ?? a.anchorHeading ?? null,
    anchorContext: derived?.anchorContext ?? a.anchorContext ?? null,
    anchorCharacter: derived?.anchorCharacter ?? a.anchorCharacter ?? null,
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Format tag of the review file testers send back. */
export const NOTES_FORMAT = 'coil-notes'

/**
 * The notes review file: every note with its author and anchors, plus the document name and a hash of the exact
 * text the notes were written against (so the importer can tell whether the script has moved on).
 */
export async function buildNotesExport(
  annotations: Annotation[],
  needsPlacing: Annotation[],
  fileName: string,
  content: string | null,
  author: string,
  documentId: string | null,
) {
  const row = (a: Annotation, placed: boolean) => ({
    id: a.id,
    author: a.author ?? null,
    action: a.action,
    severity: a.severity || null,
    dimensions: a.dimensions || [],
    selectedText: a.selectedText,
    comment: a.comment,
    proposedText: a.proposedText || null,
    from: a.from,
    to: a.to,
    createdAt: a.createdAt,
    ...exportAnchor(a, content, fileName, placed),
  })
  return {
    format: NOTES_FORMAT,
    version: 1,
    source: fileName,
    fileName,
    documentId,
    revisionHash: content === null ? null : await sha256Hex(content),
    author,
    exportedAt: new Date().toISOString(),
    count: annotations.length + needsPlacing.length,
    annotations: [...annotations.map((a) => row(a, true)), ...needsPlacing.map((a) => row(a, false))],
  }
}

/**
 * Export notes as a JSON file download, including anchor fields so they can be re-attached.
 * Anchors are derived from `content` (default: the open document).
 */
export async function exportAnnotationsJSON(
  annotations: Annotation[],
  fileName: string,
  content: string | null = useEditorStore.getState().content,
  needsPlacing: Annotation[] = useAnnotationStore.getState().needsPlacing,
  author = '',
) {
  const data = await buildNotesExport(
    annotations,
    needsPlacing,
    fileName,
    content,
    author,
    useEditorStore.getState().documentId,
  )
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  await downloadFile(blob, `${fileName.replace(/\.fountain$/i, '')}-notes.json`)
}

/**
 * Export Fountain file with inline annotation comments inserted at annotated positions.
 * Annotations are inserted as Fountain notes: [ACTION/SEVERITY] comment
 */
export async function exportAnnotatedFountain(content: string, annotations: Annotation[], fileName: string) {
  // Sort annotations by position (descending) so insertions don't shift positions
  const sorted = [...annotations].sort((a, b) => b.to - a.to)

  let annotated = content
  for (const ann of sorted) {
    const severity = ann.severity ? `/${ann.severity}` : ''
    const dims = ann.dimensions?.length ? ` [${ann.dimensions.join(', ')}]` : ''
    const marker = `/* [${ann.action.toUpperCase()}${severity}]${dims} ${ann.comment} */`

    // Insert marker after the annotated text
    annotated = `${annotated.slice(0, ann.to)} ${marker}${annotated.slice(ann.to)}`
  }

  const blob = new Blob([annotated], { type: 'text/plain' })
  await downloadFile(blob, `${fileName.replace(/\.fountain$/i, '')}-annotated.fountain`)
}
