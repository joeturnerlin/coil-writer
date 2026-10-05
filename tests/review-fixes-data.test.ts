import 'fake-indexeddb/auto'
import { EditorState } from '@codemirror/state'
import Dexie from 'dexie'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { applyFix } from '../src/lib/proofread-apply'
import { saveFountainFile } from '../src/lib/file-io'
import { openDocument } from '../src/lib/open-document'
import { db, findDocumentByFileKey, getRecoveredDocument, saveToDB, setDocumentFileKey } from '../src/lib/persistence'
import type { ProofreadFinding } from '../src/lib/proofread-types'
import { addVersion, listVersions, restoreVersion } from '../src/lib/version-history'
import { useEditorStore } from '../src/store/editor-store'

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
const V4 = {
  documents: '++id, fileName, lastModified',
  voiceProfiles: '++id, sourceHash, createdAt',
  profileOverrides: '++id, fileName, [fileName+characterName], updatedAt',
  annotations: '++id, fileName, annotationId, createdAt',
  pendingDeltas: '++id, fileName, characterName, createdAt',
  usage: '++id, [feature+period], updatedAt',
}

async function resetTo(version: number, stores: Record<string, string>, seed: (old: Dexie) => Promise<void>) {
  db.close()
  await Dexie.delete('RecoilFountainEditor')
  const old = new Dexie('RecoilFountainEditor')
  old.version(version).stores(stores)
  await seed(old)
  old.close()
}

describe('1. v5 upgrade with duplicate fileName rows', () => {
  test('opens, keeps both contents, and points fileName-keyed rows at the newest document', async () => {
    await resetTo(4, V4, async (old) => {
      await old.table('documents').bulkAdd([
        { fileName: 'Untitled.fountain', content: 'OLDER', lastModified: 1 },
        { fileName: 'Untitled.fountain', content: 'NEWER', lastModified: 2 },
        { fileName: 'other.fountain', content: 'OTHER', lastModified: 3 },
      ])
      await old.table('profileOverrides').add({
        fileName: 'Untitled.fountain',
        characterName: 'X',
        overrides: '{}',
        source: 'manual',
        updatedAt: 1,
      })
      await old.table('annotations').add({ fileName: 'Untitled.fountain', annotationId: 'a', data: '{}', createdAt: 1 })
      await old
        .table('pendingDeltas')
        .add({ fileName: 'Untitled.fountain', characterName: 'X', original: 'o', accepted: 'n', createdAt: 1 })
      await old
        .table('pendingDeltas')
        .add({ fileName: 'ghost.fountain', characterName: 'Y', original: 'o', accepted: 'n', createdAt: 1 })
    })
    await db.open()
    const docs = await db.documents.orderBy('lastModified').toArray()
    expect(docs.map((d) => d.content)).toEqual(['OLDER', 'NEWER', 'OTHER'])
    expect(new Set(docs.map((d) => d.documentId)).size).toBe(3)
    const newestId = docs[1].documentId
    expect((await db.profileOverrides.toArray())[0].documentId).toBe(newestId)
    expect((await db.annotations.toArray())[0].documentId).toBe(newestId)
    const deltas = await db.pendingDeltas.toArray()
    expect(deltas.find((d) => d.fileName === 'Untitled.fountain')?.documentId).toBe(newestId)
    expect(deltas.find((d) => d.fileName === 'ghost.fountain')?.documentId).toBeTruthy()
  })

  test('a v5 database (already upgraded) still opens at v6 with its rows intact', async () => {
    await resetTo(
      5,
      {
        ...V4,
        documents: '++id, &documentId, fileName, lastModified',
        profileOverrides: '++id, fileName, documentId, [fileName+characterName], [documentId+characterName], updatedAt',
        annotations: '++id, fileName, documentId, annotationId, createdAt',
        pendingDeltas: '++id, fileName, documentId, characterName, createdAt',
        versions: '++id, documentId, createdAt',
      },
      async (old) => {
        await old.table('documents').add({ documentId: 'd-5', fileName: 'v5.fountain', content: 'V5', lastModified: 1 })
      },
    )
    await db.open()
    expect((await db.documents.toArray())[0]).toMatchObject({ documentId: 'd-5', content: 'V5' })
    await setDocumentFileKey('d-5', 'k')
    expect((await findDocumentByFileKey('k'))?.documentId).toBe('d-5')
  })
})

describe('2. switching documents during an await', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await Promise.all([db.documents.clear(), db.versions.clear()])
  })

  test('restoreVersion aborts: no pre-restore snapshot of the other document, no dispatch', async () => {
    useEditorStore.getState().openFile('s.fountain', 'draft one', undefined, 'doc-R')
    const dispatch = vi.fn()
    const view = {
      // The editor view follows whatever document the store holds, like the real one after a switch.
      state: { doc: { toString: () => useEditorStore.getState().content ?? '', length: 9 } },
      dispatch,
    }
    useEditorStore.setState({ viewRef: { current: view } as never })
    const v1 = await addVersion('doc-R', 'old text', 'manual', 'first')
    const pending = restoreVersion(v1!.id!)
    useEditorStore.getState().openFile('t.fountain', 'a different script', undefined, 'doc-T')
    expect(await pending).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
    const all = [...(await listVersions('doc-R')), ...(await listVersions('doc-T'))]
    expect(all.some((v) => v.kind === 'pre-restore' || v.kind === 'restore')).toBe(false)
    expect(all.some((v) => v.content === 'a different script')).toBe(false)
    useEditorStore.setState({ viewRef: null })
  })

  const finding: ProofreadFinding = {
    id: 'f',
    category: 'spelling',
    source: 'ai',
    severity: 'warning',
    claim: 'typo',
    suggestion: 'receive',
    evidence: [{ line: 1, quote: 'recieve', lineText: 'I recieve it' }],
    revisionHash: 'h',
  }
  const fakeView = () => ({ state: EditorState.create({ doc: 'I recieve it' }), dispatch: vi.fn() })

  test('applyFix applies when nothing moved (control)', async () => {
    const view = fakeView()
    useEditorStore.getState().openFile('a.fountain', 'I recieve it', undefined, 'doc-A')
    useEditorStore.setState({ viewRef: { current: view } as never })
    expect(await applyFix(finding)).toBeNull()
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    useEditorStore.setState({ viewRef: null })
  })

  test('applyFix writes nothing if another document was opened while the snapshot was saved', async () => {
    const view = fakeView()
    useEditorStore.getState().openFile('a.fountain', 'I recieve it', undefined, 'doc-A')
    useEditorStore.setState({ viewRef: { current: view } as never })
    const pending = applyFix(finding)
    useEditorStore.getState().openFile('b.fountain', 'other', undefined, 'doc-B')
    expect(await pending).toMatch(/changed/)
    expect(view.dispatch).not.toHaveBeenCalled()
    useEditorStore.setState({ viewRef: null })
  })
})

describe('3. reopening a file finds its history', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await Promise.all([db.documents.clear(), db.versions.clear()])
  })
  const TEXT = 'INT. ROOM - DAY\n\nHello.'

  test('desktop: same fileKey -> same documentId; the stored text is kept in history when disk differs', async () => {
    await openDocument({ name: 'a.fountain', data: enc(TEXT), documentId: 'main-1', fileKey: 'K1' })
    const first = useEditorStore.getState().documentId as string
    expect(useEditorStore.getState().fileKey).toBe('K1')
    await saveToDB(first, 'a.fountain', 'EDITED IN COIL', useEditorStore.getState().fileKey)
    await openDocument({ name: 'b.fountain', data: enc('other'), documentId: 'main-2', fileKey: 'K2' })
    expect(useEditorStore.getState().documentId).not.toBe(first)
    await openDocument({ name: 'a.fountain', data: enc(TEXT), documentId: 'main-3', fileKey: 'K1' })
    expect(useEditorStore.getState().documentId).toBe(first)
    expect((await listVersions(first)).some((v) => v.content === 'EDITED IN COIL')).toBe(true)
  })

  test('desktop: a different path with the same name is a different document', async () => {
    await openDocument({ name: 'a.fountain', data: enc(TEXT), fileKey: 'K1' })
    const first = useEditorStore.getState().documentId
    await saveToDB(first as string, 'a.fountain', TEXT, 'K1')
    await openDocument({ name: 'a.fountain', data: enc(TEXT), fileKey: 'K-other-folder' })
    expect(useEditorStore.getState().documentId).not.toBe(first)
  })

  test('web: reuse only for the same name AND identical content', async () => {
    await saveToDB('stored', 'a.fountain', TEXT)
    await openDocument({ name: 'a.fountain', data: enc(TEXT) })
    expect(useEditorStore.getState().documentId).toBe('stored')
    await openDocument({ name: 'a.fountain', data: enc(`${TEXT}\n\nChanged.`) })
    expect(useEditorStore.getState().documentId).not.toBe('stored')
    await openDocument({ name: 'z.fountain', data: enc(TEXT) })
    expect(useEditorStore.getState().documentId).not.toBe('stored')
  })

  test('Save As moves the stored fileKey to the current document', async () => {
    await openDocument({ name: 'a.fountain', data: enc(TEXT), documentId: 'main-1', fileKey: 'K1' })
    const id = useEditorStore.getState().documentId as string
    await saveToDB(id, 'a.fountain', TEXT, 'K1')
    vi.stubGlobal('window', {
      coil: { save: async () => ({ name: 'b.fountain', documentId: 'main-9', fileKey: 'K9' }) },
    })
    await saveFountainFile('a.fountain', TEXT, true)
    vi.unstubAllGlobals()
    expect(useEditorStore.getState().fileKey).toBe('K9')
    expect((await findDocumentByFileKey('K9'))?.documentId).toBe(id)
    expect(await findDocumentByFileKey('K1')).toBeNull()
  })

  test('an explicit id clears the recovered hint, so reopening the same text cannot overwrite the recovered copy', async () => {
    await saveToDB('rec', 'r.fountain', 'recovered text')
    const rec = await getRecoveredDocument()
    useEditorStore.getState().openFile(rec!.fileName, rec!.content, undefined, rec!.documentId)
    useEditorStore.getState().openFile('r.fountain', 'recovered text')
    expect(useEditorStore.getState().documentId).not.toBe('rec')
  })
})

describe('unload emergency copy', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  test('an edit stashed at unload (newer than the last IndexedDB save) is recovered and persisted', async () => {
    const { saveToDB, getRecoveredDocument, stashUnsaved, db } = await import('../src/lib/persistence')
    await db.documents.clear()
    await saveToDB('doc-a', 'a.fountain', 'OLD TEXT')
    await new Promise((r) => setTimeout(r, 5))
    stashUnsaved({ documentId: 'doc-a', fileName: 'a.fountain', doc: 'OLD TEXT plus the last keystrokes' })
    const recovered = await getRecoveredDocument()
    expect(recovered?.content).toBe('OLD TEXT plus the last keystrokes')
    expect((await db.documents.where('documentId').equals('doc-a').first())?.content).toBe('OLD TEXT plus the last keystrokes')
    expect(localStorage.getItem('coil-unsaved-edit')).toBeNull()
  })

  test('a stale stash older than the saved copy is ignored', async () => {
    const { saveToDB, getRecoveredDocument, db } = await import('../src/lib/persistence')
    await db.documents.clear()
    localStorage.setItem('coil-unsaved-edit', JSON.stringify({ documentId: 'doc-b', fileName: 'b.fountain', doc: 'STALE', at: 1 }))
    await saveToDB('doc-b', 'b.fountain', 'NEWER')
    expect((await getRecoveredDocument())?.content).toBe('NEWER')
  })
})

test('concurrent startup recoveries share one result (StrictMode double effect)', async () => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  const { saveToDB, getRecoveredDocument, stashUnsaved, db } = await import('../src/lib/persistence')
  await db.documents.clear()
  await saveToDB('doc-c', 'c.fountain', 'OLD')
  await new Promise((r) => setTimeout(r, 5))
  stashUnsaved({ documentId: 'doc-c', fileName: 'c.fountain', doc: 'NEW KEYSTROKES' })
  const [a, b] = await Promise.all([getRecoveredDocument(), getRecoveredDocument()])
  expect(a?.content).toBe('NEW KEYSTROKES')
  expect(b?.content).toBe('NEW KEYSTROKES')
})

describe('emergency copy durability (Astra round 3)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })

  test('a failed recovery write keeps the stash for the next attempt', async () => {
    const persistence = await import('../src/lib/persistence')
    await persistence.db.documents.clear()
    persistence.stashUnsaved({ documentId: 'doc-f', fileName: 'f.fountain', doc: 'LATEST' })
    const spy = vi.spyOn(persistence.db, 'transaction').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await expect(persistence.getRecoveredDocument()).rejects.toThrow('QuotaExceededError')
    spy.mockRestore()
    expect(localStorage.getItem('coil-unsaved-edit')).not.toBeNull()
    expect((await persistence.getRecoveredDocument())?.content).toBe('LATEST')
    expect(localStorage.getItem('coil-unsaved-edit')).toBeNull()
  })

  test('the recovered stash keeps its file key, and a Save As key is not overwritten', async () => {
    const persistence = await import('../src/lib/persistence')
    await persistence.db.documents.clear()
    persistence.stashUnsaved({ documentId: 'doc-g', fileName: 'g.fountain', doc: 'TEXT', fileKey: 'key-g' })
    await persistence.getRecoveredDocument()
    expect((await persistence.findDocumentByFileKey('key-g'))?.documentId).toBe('doc-g')
    await persistence.setDocumentFileKey('doc-g', 'key-saveas')
    await persistence.saveToDB('doc-g', 'g.fountain', 'TEXT 2', 'key-g', true)
    expect((await persistence.db.documents.where('documentId').equals('doc-g').first())?.fileKey).toBe('key-saveas')
  })
})
