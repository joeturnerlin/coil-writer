import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('coil', {
  open: () => ipcRenderer.invoke('coil:open'),
  save: (input: { name: string; data: ArrayBuffer; mode: 'save' | 'saveAs' | 'export'; documentId?: string | null }) => ipcRenderer.invoke('coil:save', input),
  onOpen: (callback: (file: { name: string; data: ArrayBuffer; documentId?: string; fileKey?: string }) => void) => {
    const listener = (_event: unknown, file: { name: string; data: ArrayBuffer; documentId?: string; fileKey?: string }) => callback(file)
    ipcRenderer.on('coil:opened', listener)
    return () => ipcRenderer.removeListener('coil:opened', listener)
  },
  onCommand: (callback: (command: string) => void) => {
    const listener = (_event: unknown, command: string) => callback(command)
    ipcRenderer.on('coil:command', listener)
    return () => ipcRenderer.removeListener('coil:command', listener)
  },
  ready: () => ipcRenderer.send('coil:ready'),
})
