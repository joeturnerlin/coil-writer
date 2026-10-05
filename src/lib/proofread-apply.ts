/** One-click Apply for a verified AI finding (spelling / wrong-name). */
import type { EditorView } from '@codemirror/view'
import { useEditorStore } from '../store/editor-store'
import type { ProofreadFinding } from './proofread-types'
import { applyTarget } from './proofread-verify'
import { snapshotBeforeAI } from './version-history'

export function editorView(): EditorView | null {
  return useEditorStore.getState().viewRef?.current ?? null
}

export async function applyFix(f: ProofreadFinding): Promise<string | null> {
  const v = editorView()
  if (!v) return 'Editor not ready.'
  const documentId = useEditorStore.getState().documentId
  const sameDocument = () => useEditorStore.getState().documentId === documentId && editorView() === v
  const target = applyTarget(f, v.state.doc.toString().split('\n'))
  if (!target) return 'That line changed; re-check.'
  try {
    await snapshotBeforeAI('Proofread fix')
  } catch {
    return 'Could not save a version snapshot, so nothing was changed.'
  }
  // After the await the user may have opened another document: never write this fix into it.
  if (!sameDocument()) return 'The document changed; nothing was applied.'
  // Re-resolve after the await: the text may have moved while the snapshot was written.
  const again = applyTarget(f, v.state.doc.toString().split('\n'))
  if (!again) return 'That line changed; re-check.'
  const from = v.state.doc.line(again.line).from + again.start
  v.dispatch({
    changes: { from, to: from + (again.end - again.start), insert: again.replacement },
    selection: { anchor: from, head: from + again.replacement.length },
  })
  return null
}
