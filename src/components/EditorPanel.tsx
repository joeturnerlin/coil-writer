import { useCallback, useEffect, useRef } from 'react'
import { annotationField } from '../editor/annotation-state'
import { createEditorExtensions, subtextCompartment, themeCompartment } from '../editor/editor-setup'
import { fountainDarkTheme, fountainLightTheme } from '../editor/fountain-theme'
import { buildRewriteSelection } from '../editor/rewrite-selection'
import { subtextExtension } from '../editor/subtext-decorations'
import { useCodeMirror } from '../editor/use-codemirror'
import { AUTOSAVE_INTERVAL_MS, saveToDB, stashUnsaved } from '../lib/persistence'
import { installVersionHistory } from '../lib/version-history'
import { useAIStore } from '../store/ai-store'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSettingsStore } from '../store/settings-store'

interface EditorPanelProps {
  focusMode: boolean
}

export function EditorPanel(_props: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { content, fileName, documentVersion, setStats, setCursorLine, updateContent } = useEditorStore()
  const { theme, zoomLevel, editorMode } = useSettingsStore()
  const analysisStatus = useAIStore((s) => s.analysisState.status)
  const isAnalyzing = analysisStatus === 'sending' || analysisStatus === 'analyzing'

  // Debounce timer ref for auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track previous fileName to detect when a new file is opened
  const prevDocumentVersionRef = useRef(documentVersion)

  // Latest doc awaiting the debounced autosave (null = nothing pending). Carries the document it
  // belongs to, so a file switch between edit and flush can't write one script under another's id.
  const pendingSaveRef = useRef<{ doc: string; documentId: string; fileName: string } | null>(null)

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending === null) return
    const { setSaveStatus, documentId, fileKey } = useEditorStore.getState()
    setSaveStatus('saving')
    // 'saved' only after the Dexie transaction commits; a failure is surfaced and retried.
    // fileKey is read now (not at edit time) so a Save As in between is not overwritten with the old key.
    saveToDB(
      pending.documentId,
      pending.fileName,
      pending.doc,
      documentId === pending.documentId ? fileKey : null,
    ).then(
      () => {
        if (pendingSaveRef.current === null) setSaveStatus('saved')
      },
      (error) => {
        setSaveStatus('failed', error instanceof Error ? error.message : String(error))
        if (pendingSaveRef.current === null) {
          pendingSaveRef.current = pending
          saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_INTERVAL_MS * 2)
        }
      },
    )
  }, [])

  // Doc-derived stats (also run on first load, when no edit event fires)
  const computeStats = useCallback(
    (doc: string) => {
      const lines = doc.split('\n')
      const wordCount = doc.split(/\s+/).filter(Boolean).length
      const totalContentLines = lines.filter((l) => l.trim() !== '').length

      // Count dialogue lines (rough: lines following character/parenthetical lines)
      let dialogueLines = 0
      let prevType: string | null = null
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '') {
          prevType = 'blank'
          continue
        }
        if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) {
          prevType = 'heading'
          continue
        }
        const afterBreak = prevType === null || prevType === 'blank' || prevType === 'heading'
        if (
          afterBreak &&
          /^[A-Z][A-Z0-9 .']+(\s*\(.*\))?$/.test(trimmed) &&
          trimmed.length < 50 &&
          !/[.!?]$/.test(trimmed.replace(/\s*\(.*\)$/, ''))
        ) {
          prevType = 'character'
          continue
        }
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          prevType = 'parenthetical'
          dialogueLines++
          continue
        }
        if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
          prevType = 'dialogue'
          dialogueLines++
          continue
        }
        prevType = 'action'
      }

      const episodeCount = (doc.match(/\[\[EPISODE\s+\d+/gi) || []).length
      const sceneCount = (doc.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/gim) || []).length

      setStats({
        lineCount: lines.length,
        wordCount,
        dialogueLineCount: dialogueLines,
        totalContentLines,
        dialoguePercentage: totalContentLines > 0 ? Math.round((dialogueLines / totalContentLines) * 100) : 0,
        estimatedPages: Math.round(totalContentLines / 55),
        episodeCount,
        sceneCount,
      })
    },
    [setStats],
  )

  const onUpdate = useCallback(
    ({
      doc,
      annotationsChanged,
      cursorLine,
    }: { doc: string | null; annotationsChanged: boolean; cursorLine: number }) => {
      setCursorLine(cursorLine)

      // Sync annotations from CM6 to Zustand (for React sidebar)
      const syncAnnotations = () => {
        const storeView = useEditorStore.getState().viewRef?.current
        if (storeView) {
          try {
            const anns = storeView.state.field(annotationField).annotations
            useAnnotationStore.getState().syncFromEditor(anns)
          } catch {
            // annotationField may not be available yet during initialization
          }
        }
      }

      // Selection-only / annotation-only updates skip all doc-derived work
      if (doc === null) {
        if (annotationsChanged) syncAnnotations()
        return
      }
      updateContent(doc)

      // Update scene model (debounced internally by script-store)
      useScriptStore.getState().updateFromContent(doc)

      computeStats(doc)

      syncAnnotations()

      // Auto-save to IndexedDB (AUTOSAVE_INTERVAL_MS debounce); flushSave also runs on unmount / beforeunload
      const { documentId, fileName: currentFileName } = useEditorStore.getState()
      if (documentId && currentFileName) {
        // A different document's edit still pending: write it out under its own id first
        if (pendingSaveRef.current && pendingSaveRef.current.documentId !== documentId) flushSave()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        pendingSaveRef.current = { doc, documentId, fileName: currentFileName }
        useEditorStore.getState().setSaveStatus('saving')
        saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_INTERVAL_MS)
      }
    },
    [computeStats, setCursorLine, updateContent, flushSave],
  )

  // Automatic version snapshots (idempotent)
  useEffect(() => installVersionHistory(), [])

  // Flush a pending autosave when the editor unmounts or the page closes
  useEffect(() => {
    // Unload can't wait for IndexedDB: keep a synchronous copy of any pending edit, then start the normal save.
    const onUnload = () => {
      if (pendingSaveRef.current) stashUnsaved(pendingSaveRef.current)
      flushSave()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      flushSave()
    }
  }, [flushSave])

  const extensions = createEditorExtensions(theme, 'write', onUpdate)
  const viewRef = useCodeMirror(containerRef, content ?? '', extensions)

  // Load new content into CM6 when a different file is opened
  useEffect(() => {
    const view = viewRef.current
    if (!view || content === null) return
    if (documentVersion !== prevDocumentVersionRef.current) {
      prevDocumentVersionRef.current = documentVersion
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
      // Force scene model update on file open (onUpdate only fires on edits)
      useScriptStore.getState().forceUpdate(content)
    }
  }, [documentVersion, content, viewRef])

  // Also populate scene model on initial load (auto-recovery)
  useEffect(() => {
    if (content) {
      useScriptStore.getState().forceUpdate(content)
      computeStats(content)
    }
  }, [])

  // Theme switching via Compartment
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const newTheme = theme === 'dark' ? fountainDarkTheme : fountainLightTheme
    view.dispatch({
      effects: themeCompartment.reconfigure(newTheme),
    })
  }, [theme, viewRef])

  // Subtext gutter — only active in Analyze mode
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: subtextCompartment.reconfigure(editorMode === 'analyze' ? subtextExtension : []),
    })
  }, [editorMode, viewRef])

  // Expose viewRef to store for episode navigation scrolling
  useEffect(() => {
    useEditorStore.getState().setViewRef(viewRef)
    return () => useEditorStore.getState().setViewRef({ current: null })
  }, [viewRef])

  // Analyze mode: the rewrite popup opens only on an explicit gesture —
  // mouseup with Cmd/Ctrl held, or Cmd/Ctrl+Enter — never on a plain selection.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const openRewrite = () => {
      const view = viewRef.current
      if (!view) return false
      if (useSettingsStore.getState().editorMode !== 'analyze') return false
      const sel = view.state.selection.main
      const rewrite = buildRewriteSelection(view.state.doc.toString(), sel.from, sel.to)
      if (!rewrite) return false
      useAIStore.getState().setRewriteSelection(rewrite)
      return true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey) openRewrite()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && openRewrite()) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('keydown', onKeyDown, true)
    return () => {
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('keydown', onKeyDown, true)
    }
  }, [viewRef])

  // Open popup when editing an existing annotation (triggered by Edit button on AnnotationCard)
  const { editingAnnotation } = useAnnotationStore()

  useEffect(() => {
    if (!editingAnnotation || !viewRef.current) return
    // Open AI rewrite for editing existing annotations too
    const doc = viewRef.current.state.doc.toString()
    const contextStart = Math.max(0, editingAnnotation.from - 500)
    const contextEnd = Math.min(doc.length, editingAnnotation.to + 500)
    const context = doc.slice(contextStart, contextEnd)
    useAIStore.getState().setRewriteSelection({
      from: editingAnnotation.from,
      to: editingAnnotation.to,
      text: editingAnnotation.selectedText,
      context,
    })
  }, [editingAnnotation, viewRef])

  // Apply zoom: layout scale via CSS variable (margins, maxWidth, spacing scale
  // proportionally so line wrapping stays constant across zoom levels).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dom.style.setProperty('--zoom-scale', String(zoomLevel / 100))
  }, [zoomLevel, viewRef])

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div className="h-full overflow-auto">
        <div ref={containerRef} />
      </div>
      {isAnalyzing && <div className="analysis-scanline" />}
    </div>
  )
}
