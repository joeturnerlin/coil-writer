import { useEditorStore } from '../store/editor-store'
import { exportFile } from './converters/registry'
import { downloadFile, openScriptFile, saveFountainFile } from './file-io'
import { runExportNotes, runImportNotes } from './notes'
import { openDocument, reportError } from './open-document'

/** Connect native document events to the same imports, exports, and editor used on web. */
export function connectDesktop(): () => void {
  const bridge = window.coil
  if (!bridge) return () => {}
  const stopOpen = bridge.onOpen((file) => {
    void openDocument(file)
  })
  const stopCommand = bridge.onCommand((command) => {
    void (async () => {
      const { fileName, content } = useEditorStore.getState()
      if (command === 'open') {
        const file = await openScriptFile()
        if (file) await openDocument(file)
      } else if (command === 'importNotes') {
        if (fileName) await runImportNotes()
      } else if (command === 'exportNotes') {
        if (fileName) await runExportNotes()
      } else if (fileName && content !== null) {
        if (command === 'save' || command === 'saveAs') await saveFountainFile(fileName, content, command === 'saveAs')
        if (command === 'exportFountain')
          await downloadFile(new Blob([content]), `${fileName.replace(/\.[^.]+$/, '')}.fountain`)
        if (command === 'exportFDX') {
          const result = await exportFile(content, 'fdx', fileName)
          await downloadFile(result.data, fileName.replace(/\.[^.]+$/, '') + result.extension)
        }
        if (command === 'print') window.print()
      }
    })().catch(reportError)
  })
  bridge.ready()
  return () => {
    stopOpen()
    stopCommand()
  }
}
