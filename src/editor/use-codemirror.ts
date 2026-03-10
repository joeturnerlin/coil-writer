import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'

export function useCodeMirror(
  containerRef: React.RefObject<HTMLDivElement | null>,
  doc: string,
  extensions: Extension[],
) {
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const state = EditorState.create({ doc, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // Empty deps — never re-create. Use Compartment.reconfigure() for dynamic changes.

  return viewRef
}
