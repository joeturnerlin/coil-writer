import { useEditorStore } from '../store/editor-store'
import { importFile } from './converters/registry'

/** Surface a failed file operation to the user. */
export function reportError(error: unknown): void {
  window.alert(error instanceof Error ? error.message : String(error))
}

/** Import a script file, open it in the editor, and show any conversion warnings. Errors are reported, not thrown. */
export async function openDocument(file: { name: string; data: ArrayBuffer; documentId?: string }): Promise<void> {
  try {
    const result = await importFile(file.name, file.data)
    useEditorStore.getState().openFile(file.name, result.content, file.documentId)
    if (result.warnings.length > 0) useEditorStore.getState().setImportWarnings(result.warnings, result.format)
  } catch (error) {
    reportError(error)
  }
}
