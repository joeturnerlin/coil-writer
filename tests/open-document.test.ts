import { afterEach, expect, test, vi } from 'vitest'
import * as registry from '../src/lib/converters/registry'
import { buildRewriteSelection } from '../src/editor/rewrite-selection'
import { openDocument } from '../src/lib/open-document'
import { useEditorStore } from '../src/store/editor-store'

afterEach(() => vi.unstubAllGlobals())

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

test('openDocument imports and opens the file in the editor', async () => {
  vi.stubGlobal('window', { alert: vi.fn() })
  await openDocument({ name: 'a.fountain', data: enc('INT. ROOM - DAY\n\nHello.'), documentId: 'd1' })
  expect(useEditorStore.getState()).toMatchObject({ fileName: 'a.fountain', desktopDocumentId: 'd1' })
})

test('openDocument reports a failed import instead of throwing', async () => {
  const alert = vi.fn()
  vi.stubGlobal('window', { alert })
  vi.spyOn(registry, 'importFile').mockRejectedValueOnce(new Error('corrupt file'))
  await expect(openDocument({ name: 'bad.fdx', data: enc('x') })).resolves.toBeUndefined()
  expect(alert).toHaveBeenCalledWith('corrupt file')
})

test('rewrite selection needs 20+ non-blank characters', () => {
  const doc = 'a'.repeat(30)
  expect(buildRewriteSelection(doc, 5, 5)).toBeNull()
  expect(buildRewriteSelection(doc, 0, 19)).toBeNull()
  expect(buildRewriteSelection(`${' '.repeat(30)}x`, 0, 31)).toBeNull()
  expect(buildRewriteSelection(doc, 0, 20)).toMatchObject({ from: 0, to: 20, text: 'a'.repeat(20) })
})
