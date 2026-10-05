/**
 * Notes persistence. Placed notes live in the CodeMirror annotation field; this module saves them (with fresh
 * anchors) to Dexie under the open document's id, and on open re-resolves each one against the CURRENT text.
 */

import type { EditorView } from '@codemirror/view'
import { addAnnotation, clearAnnotations } from '../editor/annotation-state'
import type { Annotation } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { anchorAnnotation, resolveAnchor } from './note-transfer'
import { type StoredNote, ensureDocument, loadNotes, saveNotes } from './persistence'

/** Notes trail the document autosave (2 s) so a restart never finds a note newer than the text it points into. */
const NOTES_SAVE_DELAY_MS = 2500

interface Pending {
  documentId: string
  fileName: string
  content: string
  fileKey: string | null
  annotations: Annotation[]
  needsPlacing: Annotation[]
}

let loadedFor: string | null = null
let pending: Pending | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** Every save runs after the previous one, so a load can wait for "everything written so far". */
let saveChain: Promise<void> = Promise.resolve()

export function buildStoredNotes(
  content: string,
  fileName: string,
  annotations: Annotation[],
  needsPlacing: Annotation[],
): StoredNote[] {
  const placed = annotations.map((a): StoredNote => {
    if (a.from >= a.to) return { placed: true, note: a }
    return {
      placed: true,
      note: { ...a, ...anchorAnnotation(a, content, fileName), selectedText: content.slice(a.from, a.to) },
    }
  })
  return [...placed, ...needsPlacing.map((note): StoredNote => ({ placed: false, note }))]
}

/** Resolve stored notes against `content`: placed only when the anchor is certain, otherwise "Needs placing". */
export function resolveStoredNotes(stored: StoredNote[], content: string) {
  const placed: Annotation[] = []
  const needsPlacing: Annotation[] = []
  for (const { placed: wasPlaced, note } of stored) {
    if (!wasPlaced) {
      needsPlacing.push(note)
      continue
    }
    const r = resolveAnchor(
      {
        anchorHeading: note.anchorHeading ?? '',
        anchorContext: note.anchorContext ?? '',
        anchorCharacter: note.anchorCharacter ?? '',
        fileName: note.fileName ?? '',
      },
      note.from,
      note.to,
      note.selectedText,
      content,
    )
    if (r.confidence === 'exact' || r.confidence === 'heading' || r.confidence === 'fuzzy') {
      placed.push({ ...note, from: r.from, to: r.to })
    } else {
      needsPlacing.push({ ...note, from: 0, to: 0 })
    }
  }
  return { placed, needsPlacing }
}

export function flushNotes(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  const p = pending
  pending = null
  if (!p) return saveChain
  saveChain = saveChain.then(() =>
    ensureDocument(p.documentId, p.fileName, p.content, p.fileKey)
      .then(() =>
        saveNotes(p.documentId, p.fileName, buildStoredNotes(p.content, p.fileName, p.annotations, p.needsPlacing)),
      )
      .catch((error) => console.warn('notes save failed', error)),
  )
  return saveChain
}

/** Subscribe once: any change to notes of the open (and loaded) document schedules a save. */
export function installNotesPersistence(): () => void {
  const unsubscribe = useAnnotationStore.subscribe((state, prev) => {
    if (state.annotations === prev.annotations && state.needsPlacing === prev.needsPlacing) return
    const { documentId, fileName, content, fileKey } = useEditorStore.getState()
    if (!documentId || !fileName || content === null || loadedFor !== documentId) return
    pending = {
      documentId,
      fileName,
      content,
      fileKey,
      annotations: state.annotations,
      needsPlacing: state.needsPlacing,
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flushNotes(), NOTES_SAVE_DELAY_MS)
  })
  const onHide = () => void flushNotes()
  window.addEventListener('pagehide', onHide)
  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onHide)
  }
}

/** Switch the editor's notes to `documentId`'s stored ones. Call after the document text is in the view. */
export function openNotesFor(view: EditorView, documentId: string): () => void {
  // Anything still pending (or in flight) for the previous open must reach storage BEFORE we read it back.
  const settled = flushNotes()
  loadedFor = null
  view.dispatch({ effects: clearAnnotations.of() })
  useAnnotationStore.getState().setNeedsPlacing([])
  useAnnotationStore.getState().setSelectedId(null)
  let cancelled = false
  settled
    .then(() => loadNotes(documentId))
    .then((stored) => {
      if (cancelled) return
      const { placed, needsPlacing } = resolveStoredNotes(stored, view.state.doc.toString())
      // loadedFor stays null until the notes are in the editor and store: a load never schedules a save.
      if (placed.length > 0) view.dispatch({ effects: placed.map((n) => addAnnotation.of(n)) })
      useAnnotationStore.getState().setNeedsPlacing(needsPlacing)
      loadedFor = documentId
    })
    .catch((error) => {
      console.warn('notes load failed', error)
      if (!cancelled) loadedFor = documentId
    })
  return () => {
    cancelled = true
  }
}
