import { afterEach, expect, test, vi } from 'vitest'
import { useEditorStore } from '../src/store/editor-store'
import { saveFountainFile } from '../src/lib/file-io'

afterEach(() => vi.unstubAllGlobals())

test('a pending Save As cannot attach its result to another opened document', async () => {
  let complete!: (saved: { name: string; documentId: string }) => void
  vi.stubGlobal('window', { coil: { save: () => new Promise((resolve) => { complete = resolve }) } })
  useEditorStore.getState().openFile('A.fountain', 'Document A', 'a')
  const saving = saveFountainFile('A.fountain', 'Document A', true)
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  useEditorStore.getState().openFile('B.fountain', 'Document B', 'b')
  complete({ name: 'Saved A.fountain', documentId: 'saved-a' })
  await saving
  expect(useEditorStore.getState()).toMatchObject({ fileName: 'B.fountain', content: 'Document B', desktopDocumentId: 'b' })
})

test('canceling a native Save As keeps the current filename and document identity', async () => {
  vi.stubGlobal('window', { coil: { save: async () => null } })
  useEditorStore.getState().openFile('A.fountain', '', 'a')
  await saveFountainFile('A.fountain', '', true)
  expect(useEditorStore.getState()).toMatchObject({ fileName: 'A.fountain', content: '', desktopDocumentId: 'a' })
})
