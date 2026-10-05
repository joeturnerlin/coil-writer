import type { Annotation } from '../editor/types'
import { useEditorStore } from '../store/editor-store'
import { downloadFile } from './file-io'
import { anchorAnnotation } from './note-transfer'

function exportAnchor(a: Annotation, content: string | null, fileName: string) {
  const derived = content !== null && a.anchorContext === undefined ? anchorAnnotation(a, content, fileName) : null
  return {
    anchorHeading: a.anchorHeading ?? derived?.anchorHeading ?? null,
    anchorContext: a.anchorContext ?? derived?.anchorContext ?? null,
    anchorCharacter: a.anchorCharacter ?? derived?.anchorCharacter ?? null,
  }
}

/**
 * Export annotations as a JSON file download, including anchor fields so notes can be re-attached.
 * Anchors missing on an annotation are derived from `content` (default: the open document).
 */
export async function exportAnnotationsJSON(
  annotations: Annotation[],
  fileName: string,
  content: string | null = useEditorStore.getState().content,
) {
  const data = {
    source: fileName,
    documentId: useEditorStore.getState().documentId,
    exportedAt: new Date().toISOString(),
    count: annotations.length,
    annotations: annotations.map((a) => ({
      id: a.id,
      action: a.action,
      severity: a.severity || null,
      dimensions: a.dimensions || [],
      selectedText: a.selectedText,
      comment: a.comment,
      proposedText: a.proposedText || null,
      from: a.from,
      to: a.to,
      createdAt: a.createdAt,
      ...exportAnchor(a, content, fileName),
    })),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  await downloadFile(blob, `${fileName.replace(/\.fountain$/i, '')}-annotations.json`)
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
