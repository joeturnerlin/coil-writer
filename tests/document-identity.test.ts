import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, test } from 'vitest'
import { buildDocumentIdMap, db, getRecoveredDocument, saveToDB } from '../src/lib/persistence'
import {
  MAX_AUTO_VERSIONS,
  addVersion,
  diffLines,
  lineDelta,
  listVersions,
  restoreVersion,
  saveVersion,
} from '../src/lib/version-history'
import { useEditorStore } from '../src/store/editor-store'
import { useRevisionStore } from '../src/store/revision-store'

beforeEach(async () => {
  await Promise.all([db.documents.clear(), db.versions.clear()])
})

describe('documentId', () => {
  test('two different scripts with the same fileName do not overwrite each other', async () => {
    await saveToDB('id-1', 'script.fountain', 'FIRST SCRIPT')
    await saveToDB('id-2', 'script.fountain', 'SECOND SCRIPT')
    await saveToDB('id-1', 'script.fountain', 'FIRST SCRIPT, edited')
    const rows = await db.documents.orderBy('documentId').toArray()
    expect(rows.map((r) => [r.documentId, r.content])).toEqual([
      ['id-1', 'FIRST SCRIPT, edited'],
      ['id-2', 'SECOND SCRIPT'],
    ])
    expect((await getRecoveredDocument())?.documentId).toBe('id-1')
  })

  test('saveToDB resolves only after the write is readable (committed)', async () => {
    await saveToDB('id-3', 'a.fountain', 'x')
    expect((await db.documents.where('documentId').equals('id-3').first())?.content).toBe('x')
  })

  test('openFile assigns a fresh id per document, and a recovered doc keeps its id', async () => {
    const s = useEditorStore.getState()
    s.openFile('script.fountain', 'one')
    const a = useEditorStore.getState().documentId
    useEditorStore.getState().openFile('script.fountain', 'two')
    const b = useEditorStore.getState().documentId
    expect(a && b && a !== b).toBe(true)
    await saveToDB('rec-1', 'r.fountain', 'recovered text')
    const rec = await getRecoveredDocument()
    useEditorStore.getState().openFile(rec!.fileName, rec!.content) // caller that does not pass the id
    expect(useEditorStore.getState().documentId).toBe('rec-1')
  })

  test('revisions carry the open document id; clear only clears that document', () => {
    useRevisionStore.setState({ revisions: [], currentPass: 1 })
    useEditorStore.getState().openFile('a.fountain', 'a', undefined, 'doc-A')
    useRevisionStore
      .getState()
      .addRevision({ from: 0, to: 1, originalText: 'a', newText: 'b', type: 'manual-edit', lineNumber: 1 })
    useEditorStore.getState().openFile('a.fountain', 'a', undefined, 'doc-B')
    useRevisionStore
      .getState()
      .addRevision({ from: 0, to: 1, originalText: 'a', newText: 'c', type: 'manual-edit', lineNumber: 1 })
    expect(useRevisionStore.getState().revisionsFor('doc-A')).toHaveLength(1)
    useRevisionStore.getState().clearRevisions()
    expect(useRevisionStore.getState().revisionsFor('doc-B')).toHaveLength(0)
    expect(useRevisionStore.getState().revisionsFor('doc-A')).toHaveLength(1)
  })

  test('legacy revisions are adopted by the first document opened', () => {
    useRevisionStore.setState({
      revisions: [
        {
          id: 'old',
          from: 0,
          to: 1,
          originalText: '',
          newText: '',
          type: 'manual-edit',
          timestamp: '',
          revisionPass: 1,
          lineNumber: 1,
        },
      ],
    })
    useEditorStore.getState().openFile('z.fountain', 'z', undefined, 'doc-Z')
    expect(useRevisionStore.getState().revisionsFor('doc-Z')).toHaveLength(1)
  })
})

describe('migration', () => {
  test('buildDocumentIdMap gives one id per distinct fileName', () => {
    let n = 0
    const m = buildDocumentIdMap(['a', 'b', 'a'], () => `id${++n}`)
    expect([...m]).toEqual([
      ['a', 'id1'],
      ['b', 'id2'],
    ])
  })

  test('a v4 database is upgraded: every legacy row gets a documentId, rows stay linked', async () => {
    db.close()
    await Dexie.delete('RecoilFountainEditor')
    const old = new Dexie('RecoilFountainEditor')
    old.version(4).stores({
      documents: '++id, fileName, lastModified',
      voiceProfiles: '++id, sourceHash, createdAt',
      profileOverrides: '++id, fileName, [fileName+characterName], updatedAt',
      annotations: '++id, fileName, annotationId, createdAt',
      pendingDeltas: '++id, fileName, characterName, createdAt',
      usage: '++id, [feature+period], updatedAt',
    })
    await old.table('documents').bulkAdd([
      { fileName: 'a.fountain', content: 'A', lastModified: 1 },
      { fileName: 'b.fountain', content: 'B', lastModified: 2 },
    ])
    await old
      .table('pendingDeltas')
      .add({ fileName: 'a.fountain', characterName: 'X', original: 'o', accepted: 'n', createdAt: 1 })
    await old
      .table('pendingDeltas')
      .add({ fileName: 'ghost.fountain', characterName: 'Y', original: 'o', accepted: 'n', createdAt: 1 })
    old.close()

    await db.open()
    const docs = await db.documents.toArray()
    expect(docs.every((d) => typeof d.documentId === 'string' && d.documentId.length > 10)).toBe(true)
    expect(new Set(docs.map((d) => d.documentId)).size).toBe(2)
    const deltas = await db.pendingDeltas.toArray()
    expect(deltas.find((d) => d.fileName === 'a.fountain')?.documentId).toBe(
      docs.find((d) => d.fileName === 'a.fountain')?.documentId,
    )
    expect(deltas.find((d) => d.fileName === 'ghost.fountain')?.documentId).toBeTruthy()
    expect((await getRecoveredDocument())?.content).toBe('B') // content untouched
  })
})

describe('version history', () => {
  test('identical text is deduped; a manual save of the same text relabels instead of duplicating', async () => {
    await addVersion('d', 'hello', 'auto')
    expect(await addVersion('d', 'hello', 'auto')).toBeNull()
    const kept = await addVersion('d', 'hello', 'manual', 'v1')
    expect(kept).toMatchObject({ kind: 'manual', label: 'v1' })
    expect(await listVersions('d')).toHaveLength(1)
  })

  test('automatic versions are bounded; manual ones are never pruned', async () => {
    await addVersion('d', 'manual one', 'manual', 'keep')
    for (let i = 0; i < MAX_AUTO_VERSIONS + 10; i++) await addVersion('d', `auto ${i}`, 'auto')
    const all = await listVersions('d')
    expect(all.filter((v) => v.kind === 'auto')).toHaveLength(MAX_AUTO_VERSIONS)
    expect(all.some((v) => v.label === 'keep')).toBe(true)
  })

  test('versions are per document', async () => {
    await addVersion('d1', 'same', 'auto')
    await addVersion('d2', 'same', 'auto')
    expect(await listVersions('d1')).toHaveLength(1)
    expect(await listVersions('d2')).toHaveLength(1)
  })

  test('restore snapshots the current text first, creates a NEW version and destroys nothing', async () => {
    useEditorStore.getState().openFile('s.fountain', 'draft one', undefined, 'doc-R')
    const v1 = await saveVersion('first')
    useEditorStore.getState().openFile('s.fountain', 'draft two (current)', undefined, 'doc-R')
    const before = await listVersions('doc-R')
    const restored = await restoreVersion(v1!.id!)
    const after = await listVersions('doc-R')
    expect(restored).toMatchObject({ kind: 'restore', content: 'draft one' })
    expect(after.length).toBeGreaterThan(before.length)
    expect(after.some((v) => v.content === 'draft two (current)' && v.kind === 'pre-restore')).toBe(true)
    expect(after.some((v) => v.id === v1!.id && v.content === 'draft one')).toBe(true) // original intact
    expect(useEditorStore.getState().content).toBe('draft one')
  })

  test('line diff and delta', () => {
    expect(lineDelta('a\nb\nc', 'a\nB\nc\nd')).toEqual({ added: 2, removed: 1 })
    expect(diffLines('x', 'x').every((l) => l.type === 'same')).toBe(true)
  })
})
