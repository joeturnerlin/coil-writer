interface Window {
  coil?: {
    open(): Promise<{ name: string; data: ArrayBuffer; documentId?: string; fileKey?: string } | null>
    save(input: {
      name: string
      data: ArrayBuffer
      mode: 'save' | 'saveAs' | 'export'
      documentId?: string | null
    }): Promise<{ name: string; documentId: string; fileKey?: string } | null>
    onOpen(
      callback: (file: { name: string; data: ArrayBuffer; documentId?: string; fileKey?: string }) => void,
    ): () => void
    onCommand(callback: (command: string) => void): () => void
    ready(): void
  }
}
