interface Window {
  coil?: {
    open(): Promise<{ name: string; data: ArrayBuffer; documentId?: string } | null>
    save(input: {
      name: string
      data: ArrayBuffer
      mode: 'save' | 'saveAs' | 'export'
      documentId?: string | null
    }): Promise<{ name: string; documentId: string } | null>
    onOpen(callback: (file: { name: string; data: ArrayBuffer; documentId?: string }) => void): () => void
    onCommand(callback: (command: string) => void): () => void
    ready(): void
  }
}
