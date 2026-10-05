import { useEditorStore } from '../store/editor-store'
import { importFile } from './converters/registry'
import { findDocumentByFileKey, findDocumentByNameAndContent, newDocumentId } from './persistence'
import { addVersion } from './version-history'

/** Surface a failed file operation to the user. */
export function reportError(error: unknown): void {
  window.alert(error instanceof Error ? error.message : String(error))
}

/**
 * Which stored document an opened file is. Desktop: the one whose fileKey matches. Web (no paths): one with the
 * same name AND identical text. Otherwise a new document, so unrelated files never share history or overwrite.
 */
async function resolveDocumentId(name: string, content: string, fileKey?: string): Promise<string> {
  try {
    return (await lookupDocumentId(name, content, fileKey)) ?? newDocumentId()
  } catch (error) {
    // Storage unavailable (e.g. a private window): opening the file must still work, as a new document.
    console.warn('document lookup failed', error)
    return newDocumentId()
  }
}

async function lookupDocumentId(name: string, content: string, fileKey?: string): Promise<string | null> {
  if (fileKey) {
    const stored = await findDocumentByFileKey(fileKey)
    if (stored) {
      // The file on disk differs from our last autosave: keep that text in history before it is replaced.
      if (stored.content !== content)
        await addVersion(stored.documentId, stored.content, 'open', 'Before reopening from disk')
      return stored.documentId
    }
  } else {
    return findDocumentByNameAndContent(name, content)
  }
  return null
}

/** Import a script file, open it in the editor, and show any conversion warnings. Errors are reported, not thrown. */
export async function openDocument(file: {
  name: string
  data: ArrayBuffer
  documentId?: string
  fileKey?: string
}): Promise<void> {
  try {
    const result = await importFile(file.name, file.data)
    const documentId = await resolveDocumentId(file.name, result.content, file.fileKey)
    useEditorStore.getState().openFile(file.name, result.content, file.documentId, documentId, file.fileKey)
    if (result.warnings.length > 0) useEditorStore.getState().setImportWarnings(result.warnings, result.format)
  } catch (error) {
    reportError(error)
  }
}
