import { useEditorStore } from '../store/editor-store'
import { exportFile, importFile } from './converters/registry'
import { downloadFile, openScriptFile, saveFountainFile } from './file-io'

/** Connect native document events to the same imports, exports, and editor used on web. */
export function connectDesktop(): () => void {
  const bridge = window.coil
  if (!bridge) return () => {}
  const open = async (file: { name: string; data: ArrayBuffer; documentId?: string }) => {
    const result = await importFile(file.name, file.data)
    useEditorStore.getState().openFile(file.name, result.content, file.documentId)
    if (result.warnings.length) useEditorStore.getState().setImportWarnings(result.warnings, result.format)
  }
  const fail = (error: unknown) => window.alert(error instanceof Error ? error.message : String(error))
  const stopOpen = bridge.onOpen((file) => {
    void open(file).catch(fail)
  })
  const stopCommand = bridge.onCommand((command) => {
    void (async () => {
      const { fileName, content } = useEditorStore.getState()
      if (command === 'open') {
        const file = await openScriptFile()
        if (file) await open(file)
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
    })().catch(fail)
  })
  bridge.ready()
  return () => {
    stopOpen()
    stopCommand()
  }
}
