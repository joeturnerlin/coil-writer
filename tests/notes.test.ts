import 'fake-indexeddb/auto'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { beforeAll, expect, test, vi } from 'vitest'
import { annotationField, getAnnotations } from '../src/editor/annotation-state'

vi.stubGlobal('document', {
  documentElement: { style: { setProperty: () => {} } },
  body: { className: '', style: {} },
})

const { useSettingsStore } = await import('../src/store/settings-store')
const { useAnnotationStore } = await import('../src/store/annotation-store')
const notes = await import('../src/lib/notes')
const { buildNotesExport } = await import('../src/lib/export')
const { buildStoredNotes, resolveStoredNotes } = await import('../src/lib/notes-sync')
const { loadNotes, saveNotes } = await import('../src/lib/persistence')

function fakeView(doc: string): EditorView {
  let state = EditorState.create({ doc, extensions: [annotationField] })
  return {
    get state() {
      return state
    },
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      state = state.update(spec).state
    },
    focus() {},
  } as unknown as EditorView
}

const sync = (view: EditorView) => useAnnotationStore.getState().syncFromEditor(getAnnotations(view))

const SCRIPT = 'INT. KITCHEN - DAY\n\nANNA\nWe need to talk.\n\nBOB\nNo.\n\nANNA\nNo.\n'

beforeAll(() => {
  useAnnotationStore.setState({ annotations: [], needsPlacing: [], selectedId: null })
})

test('create, edit and delete go through the annotation field and the store', () => {
  const view = fakeView(SCRIPT)
  const from = SCRIPT.indexOf('We need')
  const note = notes.createNote(view, from, from + 'We need to talk.'.length, '  Too blunt?  ')
  sync(view)
  expect(note).toMatchObject({ comment: 'Too blunt?', selectedText: 'We need to talk.', author: 'Me' })
  expect(useAnnotationStore.getState().annotations).toHaveLength(1)

  notes.editNote(view, (note as { id: string }).id, 'Softer here')
  sync(view)
  expect(useAnnotationStore.getState().annotations[0].comment).toBe('Softer here')

  notes.deleteNote(view, (note as { id: string }).id)
  sync(view)
  expect(useAnnotationStore.getState().annotations).toHaveLength(0)
  // An empty comment or an empty selection never creates a note
  expect(notes.createNote(view, from, from + 3, '   ')).toBeNull()
  expect(notes.createNote(view, from, from, 'x')).toBeNull()
})

test('the author name is stamped on new notes (persistence: notes-settings.test.ts)', () => {
  useSettingsStore.getState().setAuthorName('Jason')
  const view = fakeView(SCRIPT)
  const note = notes.createNote(view, 0, 3, 'hi')
  expect(note?.author).toBe('Jason')
  useSettingsStore.getState().setAuthorName('Me')
})

test('notes survive a save → load → re-resolve cycle, even after the text moved', async () => {
  const view = fakeView(SCRIPT)
  const from = SCRIPT.indexOf('We need')
  notes.createNote(view, from, from + 16, 'persist me')
  const placed = getAnnotations(view)
  await saveNotes('doc-1', 'x.fountain', buildStoredNotes(SCRIPT, 'x.fountain', placed, []))
  const stored = await loadNotes('doc-1')
  expect(stored).toHaveLength(1)
  const edited = `A new opening line.\n\n${SCRIPT}`
  const r = resolveStoredNotes(stored, edited)
  expect(r.needsPlacing).toHaveLength(0)
  expect(edited.slice(r.placed[0].from, r.placed[0].to)).toBe('We need to talk.')
})

test('export → edit → import: certain notes are placed, an ambiguous repeated line waits in Needs placing', async () => {
  const author = fakeView(SCRIPT)
  useSettingsStore.getState().setAuthorName('Francisco')
  const talk = SCRIPT.indexOf('We need')
  const no = SCRIPT.indexOf('No.')
  const n1 = notes.createNote(author, talk, talk + 16, 'Soften')
  const n2 = notes.createNote(author, no, no + 3, 'Which No is this?')
  const file = JSON.parse(
    JSON.stringify(await buildNotesExport(getAnnotations(author), [], 'x.fountain', SCRIPT, 'Francisco', 'doc-1')),
  )
  expect(file).toMatchObject({ format: 'coil-notes', fileName: 'x.fountain', author: 'Francisco', documentId: 'doc-1' })
  expect(file.revisionHash).toMatch(/^[0-9a-f]{64}$/)
  expect(file.annotations[0]).toMatchObject({ author: 'Francisco', anchorHeading: 'INT. KITCHEN - DAY' })

  // The script moves on: a line is added on top, and Bob's cue now matches Anna's, so both "No." look alike.
  const edited = `A new opening line.\n\n${SCRIPT.replace('BOB', 'ANNA')}`
  const view = fakeView(edited)
  useAnnotationStore.setState({ annotations: [], needsPlacing: [], selectedId: null })
  const plan = await notes.importNotesFile(view, file)
  sync(view)
  expect(plan.placed.map((n) => n.id)).toEqual([(n1 as { id: string }).id])
  expect(edited.slice(plan.placed[0].from, plan.placed[0].to)).toBe('We need to talk.')
  expect(plan.placed[0].author).toBe('Francisco')
  expect(plan.needsPlacing.map((n) => n.id)).toEqual([(n2 as { id: string }).id])
  expect(useAnnotationStore.getState().needsPlacing[0].selectedText).toBe('No.')
  // nothing was placed on the guess
  expect(getAnnotations(view)).toHaveLength(1)

  // Dedupe by id: importing the same file again adds nothing
  const again = await notes.importNotesFile(view, file)
  expect(again).toMatchObject({ placed: [], needsPlacing: [], duplicates: 2 })

  // "Attach here": select the right "No." and place the waiting note
  const second = edited.lastIndexOf('No.')
  view.dispatch({ selection: { anchor: second, head: second + 3 } })
  expect(notes.attachNoteToSelection(view, (n2 as { id: string }).id)).toBe(true)
  sync(view)
  expect(useAnnotationStore.getState().needsPlacing).toHaveLength(0)
  expect(getAnnotations(view)).toHaveLength(2)
  // with no selection it refuses
  useAnnotationStore.getState().setNeedsPlacing([{ ...(n2 as object), id: 'z' } as never])
  view.dispatch({ selection: { anchor: 0 } })
  expect(notes.attachNoteToSelection(view, 'z')).toBe(false)
  useSettingsStore.getState().setAuthorName('Me')
})

test('a file that is not a notes file is rejected', () => {
  expect(() => notes.planNoteImport({ hello: 1 }, SCRIPT, new Set())).toThrow('not a Coil notes file')
  expect(() => notes.planNoteImport({ format: 'other', annotations: [] }, SCRIPT, new Set())).toThrow()
})

test('opening Notes closes Proofread and vice versa (last opened wins)', () => {
  const s = useSettingsStore.getState()
  useSettingsStore.setState({ showNotes: false, showProofread: false })
  s.toggleProofread()
  expect(useSettingsStore.getState()).toMatchObject({ showProofread: true, showNotes: false })
  s.toggleNotes()
  expect(useSettingsStore.getState()).toMatchObject({ showProofread: false, showNotes: true })
  s.toggleProofread()
  expect(useSettingsStore.getState()).toMatchObject({ showProofread: true, showNotes: false })
  useSettingsStore.setState({ showNotes: false, showProofread: false })
})

test('a read-only reviewer (no edits, so no autosave row) still gets their document row for notes', async () => {
  const { ensureDocument, findDocumentByNameAndContent, saveToDB } = await import('../src/lib/persistence')
  await ensureDocument('doc-ro', 'ro.fountain', 'TEXT', null)
  expect(await findDocumentByNameAndContent('ro.fountain', 'TEXT')).toBe('doc-ro')
  // an existing row (newer autosave) is never overwritten
  await saveToDB('doc-ro', 'ro.fountain', 'NEWER')
  await ensureDocument('doc-ro', 'ro.fountain', 'TEXT', null)
  expect(await findDocumentByNameAndContent('ro.fountain', 'NEWER')).toBe('doc-ro')
})

test('import into a CHANGED script: an offset-only match is not trusted (swapped equal-size scenes)', async () => {
  const A = 'INT. KITCHEN - DAY\n\nANNA\nNo.\n\n'
  const B = 'INT. GARAGE - NIGHT\n\nANNA\nNo.\n\n'
  const original = A + B
  const swapped = B + A
  const author = fakeView(original)
  const at = original.lastIndexOf('No.')
  notes.createNote(author, at, at + 3, 'Garage No')
  const file = JSON.parse(
    JSON.stringify(await buildNotesExport(getAnnotations(author), [], 'x.fountain', original, 'Me', 'doc-sw')),
  )
  // same text: exact offsets are kept
  useAnnotationStore.setState({ annotations: [], needsPlacing: [], selectedId: null })
  const same = await notes.importNotesFile(fakeView(original), file)
  expect(same.placed[0].from).toBe(at)
  // swapped scenes: the note must follow the GARAGE scene, never sit on the old offset (now the kitchen "No.")
  useAnnotationStore.setState({ annotations: [], needsPlacing: [], selectedId: null })
  const plan = await notes.importNotesFile(fakeView(swapped), file)
  expect(plan.placed.map((n) => n.from)).not.toContain(at)
  for (const n of plan.placed) expect(n.from).toBe(swapped.indexOf('No.'))
  // a heading-less, context-less anchor on a changed script is never trusted by offset alone
  const bare = { format: 'coil-notes', revisionHash: 'x', annotations: [{ id: 'q', comment: 'c', selectedText: 'No.', from: at, to: at + 3 }] }
  const p2 = notes.planNoteImport(bare, original, new Set())
  expect(p2.placed).toHaveLength(0)
  expect(p2.needsPlacing).toHaveLength(1)
})

test('reopening a document before the notes debounce: the newer notes survive (no stale overwrite)', async () => {
  const { openNotesFor, installNotesPersistence } = await import('../src/lib/notes-sync')
  const { useEditorStore } = await import('../src/store/editor-store')
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  const view = fakeView(SCRIPT)
  const from = SCRIPT.indexOf('We need')
  const note = notes.createNote(view, from, from + 16, 'first') as { id: string }
  await saveNotes('doc-r', 'x.fountain', buildStoredNotes(SCRIPT, 'x.fountain', getAnnotations(view), []))
  useEditorStore.setState({ documentId: 'doc-r', fileName: 'x.fountain', content: SCRIPT, fileKey: null } as never)
  const off = installNotesPersistence()
  openNotesFor(view, 'doc-r')
  await new Promise((r) => setTimeout(r, 50))
  // edit within the debounce window, then reopen the SAME document immediately
  notes.editNote(view, note.id, 'edited')
  sync(view)
  openNotesFor(view, 'doc-r')
  await new Promise((r) => setTimeout(r, 100))
  expect(getAnnotations(view)[0].comment).toBe('edited')
  expect(useAnnotationStore.getState().annotations[0]?.comment ?? 'edited').toBe('edited')
  await new Promise((r) => setTimeout(r, 2700))
  expect((await loadNotes('doc-r'))[0].note.comment).toBe('edited')
  off()
}, 10000)
