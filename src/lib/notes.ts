/**
 * Notes — create / edit / delete / place / import, on top of the CodeMirror annotation field (the SSOT for placed
 * notes) and the annotation store (React mirror + the "Needs placing" list).
 */

import type { EditorView } from '@codemirror/view'
import { addAnnotation, annotationField, removeAnnotation, updateAnnotation } from '../editor/annotation-state'
import type { Annotation } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'
import { NOTES_FORMAT, exportAnnotationsJSON, sha256Hex } from './export'
import { type AnchorData, resolveAnchor } from './note-transfer'

export function getView(): EditorView | null {
  return useEditorStore.getState().viewRef?.current ?? null
}

export function currentAuthor(): string {
  return useSettingsStore.getState().authorName.trim() || 'Me'
}

export function createNote(view: EditorView, from: number, to: number, comment: string): Annotation | null {
  const text = comment.trim()
  if (!text || from >= to) return null
  const note: Annotation = {
    id: crypto.randomUUID(),
    from,
    to,
    selectedText: view.state.doc.sliceString(from, to),
    action: 'flag',
    comment: text,
    createdAt: new Date().toISOString(),
    author: currentAuthor(),
  }
  view.dispatch({ effects: addAnnotation.of(note) })
  return note
}

export function editNote(view: EditorView, id: string, comment: string): void {
  const text = comment.trim()
  if (!text) return
  view.dispatch({ effects: updateAnnotation.of({ id, changes: { comment: text } }) })
}

export function deleteNote(view: EditorView, id: string): void {
  view.dispatch({ effects: removeAnnotation.of(id) })
  if (useAnnotationStore.getState().selectedId === id) useAnnotationStore.getState().setSelectedId(null)
}

export function deleteUnplacedNote(id: string): void {
  const store = useAnnotationStore.getState()
  store.setNeedsPlacing(store.needsPlacing.filter((n) => n.id !== id))
}

/** Scroll to a note's passage, select it, and make it the focused note. */
export function jumpToNote(view: EditorView, note: Annotation): void {
  const len = view.state.doc.length
  const from = Math.min(note.from, len)
  const to = Math.min(note.to, len)
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
  view.focus()
  useAnnotationStore.getState().setSelectedId(note.id)
}

/** Place a waiting note on the passage currently selected in the editor. Returns false when nothing is selected. */
export function attachNoteToSelection(view: EditorView, id: string): boolean {
  const store = useAnnotationStore.getState()
  const note = store.needsPlacing.find((n) => n.id === id)
  const sel = view.state.selection.main
  if (!note || sel.from === sel.to) return false
  const placed: Annotation = {
    ...note,
    from: sel.from,
    to: sel.to,
    selectedText: view.state.doc.sliceString(sel.from, sel.to),
    anchorHeading: undefined,
    anchorContext: undefined,
    anchorCharacter: undefined,
  }
  view.dispatch({ effects: addAnnotation.of(placed) })
  store.setNeedsPlacing(store.needsPlacing.filter((n) => n.id !== id))
  store.setSelectedId(id)
  return true
}

export interface ImportPlan {
  placed: Annotation[]
  needsPlacing: Annotation[]
  duplicates: number
}

interface RawNote {
  id?: unknown
  author?: unknown
  selectedText?: unknown
  comment?: unknown
  from?: unknown
  to?: unknown
  createdAt?: unknown
  anchorHeading?: unknown
  anchorContext?: unknown
  anchorCharacter?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Pure planning step of an import: re-anchor each note against the CURRENT text.
 * exact / heading / fuzzy → placed; ambiguous / orphaned → needsPlacing (never placed on a guess).
 * Notes whose id is already present (placed or waiting) are skipped.
 * `sameRevision`: the file's revisionHash equals the current text's. Otherwise an offset-only match is not trusted.
 */
export function planNoteImport(
  file: unknown,
  content: string,
  existingIds: Set<string>,
  sameRevision = false,
): ImportPlan {
  const data = file as { format?: unknown; annotations?: unknown }
  if (!data || typeof data !== 'object' || !Array.isArray(data.annotations)) {
    throw new Error('This file is not a Coil notes file.')
  }
  if (data.format !== undefined && data.format !== NOTES_FORMAT) throw new Error('This file is not a Coil notes file.')
  const plan: ImportPlan = { placed: [], needsPlacing: [], duplicates: 0 }
  const seen = new Set(existingIds)
  for (const raw of data.annotations as RawNote[]) {
    const id = str(raw?.id)
    const comment = str(raw?.comment)
    const selectedText = str(raw?.selectedText)
    if (!id || !comment) continue
    if (seen.has(id)) {
      plan.duplicates++
      continue
    }
    seen.add(id)
    const note: Annotation = {
      id,
      from: num(raw.from),
      to: num(raw.to),
      selectedText,
      action: 'flag',
      comment,
      createdAt: str(raw.createdAt) || new Date().toISOString(),
      author: str(raw.author) || undefined,
      anchorHeading: str(raw.anchorHeading),
      anchorContext: str(raw.anchorContext),
      anchorCharacter: str(raw.anchorCharacter),
    }
    const anchor: AnchorData = {
      anchorHeading: note.anchorHeading ?? '',
      anchorContext: note.anchorContext ?? '',
      anchorCharacter: note.anchorCharacter ?? '',
      fileName: '',
    }
    const r = resolveAnchor(anchor, note.from, note.to, selectedText, content, !sameRevision)
    if (r.confidence === 'exact' || r.confidence === 'heading' || r.confidence === 'fuzzy') {
      plan.placed.push({
        ...note,
        from: r.from,
        to: r.to,
        anchorHeading: undefined,
        anchorContext: undefined,
        anchorCharacter: undefined,
      })
    } else {
      plan.needsPlacing.push({ ...note, from: 0, to: 0 })
    }
  }
  return plan
}

/** Apply an import to the open document. Returns the plan for the caller's summary line. */
export async function importNotesFile(view: EditorView, file: unknown): Promise<ImportPlan> {
  const exported = (file as { revisionHash?: unknown } | null)?.revisionHash
  // Hashing is async: if the text changes meanwhile, hash again, so the offsets we place match the text we place into.
  let content = view.state.doc.toString()
  let hash = await sha256Hex(content)
  for (let tries = 0; view.state.doc.toString() !== content && tries < 3; tries++) {
    content = view.state.doc.toString()
    hash = await sha256Hex(content)
  }
  if (view.state.doc.toString() !== content) throw new Error('The script kept changing during import. Try again.')
  const sameRevision = typeof exported === 'string' && exported === hash
  const store = useAnnotationStore.getState()
  const ids = new Set([...view.state.field(annotationField).annotations, ...store.needsPlacing].map((n) => n.id))
  const plan = planNoteImport(file, content, ids, sameRevision)
  view.dispatch({ effects: plan.placed.map((n) => addAnnotation.of(n)) })
  if (plan.needsPlacing.length > 0) store.setNeedsPlacing([...store.needsPlacing, ...plan.needsPlacing])
  return plan
}

/** Pick a notes .json file (browser file input — also works in the desktop renderer) and import it. */
export function pickAndImportNotes(): Promise<ImportPlan | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      const view = getView()
      if (!file || !view) return resolve(null)
      try {
        resolve(await importNotesFile(view, JSON.parse(await file.text())))
      } catch (e) {
        reject(e instanceof SyntaxError ? new Error('This file is not a Coil notes file.') : e)
      }
    }
    input.click()
  })
}

/** File > Import Notes…: pick, import, open the panel, and say what happened (no dialogs). */
export async function runImportNotes(): Promise<void> {
  const store = useAnnotationStore.getState()
  try {
    const plan = await pickAndImportNotes()
    if (!plan) return
    const bits = [`${plan.placed.length} placed`]
    if (plan.needsPlacing.length) bits.push(`${plan.needsPlacing.length} need placing`)
    if (plan.duplicates) bits.push(`${plan.duplicates} already here`)
    store.setNotice(`Imported: ${bits.join(', ')}.`)
  } catch (e) {
    store.setNotice(e instanceof Error ? e.message : String(e))
  }
  if (!useSettingsStore.getState().showNotes) useSettingsStore.getState().toggleNotes()
}

/** File > Export Notes…: JSON review file with anchors, file name, revision hash and author. */
export async function runExportNotes(): Promise<void> {
  const { fileName } = useEditorStore.getState()
  const { annotations, needsPlacing, setNotice } = useAnnotationStore.getState()
  if (!fileName) return
  if (annotations.length + needsPlacing.length === 0) {
    setNotice('No notes to export yet.')
    if (!useSettingsStore.getState().showNotes) useSettingsStore.getState().toggleNotes()
    return
  }
  try {
    await exportAnnotationsJSON(annotations, fileName, undefined, needsPlacing, currentAuthor())
    setNotice(`Exported ${annotations.length + needsPlacing.length} notes.`)
  } catch (e) {
    setNotice(e instanceof Error ? e.message : String(e))
  }
}
