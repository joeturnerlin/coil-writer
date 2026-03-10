import { ALL_EXTENSIONS } from './converters/registry'

/**
 * Opens a script file via the browser's file picker.
 * Accepts all supported screenplay formats.
 */
export async function openScriptFile(): Promise<{ name: string; data: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ALL_EXTENSIONS

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        resolve({
          name: file.name,
          data: e.target?.result as ArrayBuffer,
        })
      }
      reader.readAsArrayBuffer(file)
    }

    input.click()
  })
}

/**
 * Downloads a Blob as a file (browser download).
 */
export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Legacy — save as .fountain (backward compat).
 */
export function saveFountainFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const name = fileName.endsWith('.fountain') ? fileName : `${fileName}.fountain`
  downloadFile(blob, name)
}
