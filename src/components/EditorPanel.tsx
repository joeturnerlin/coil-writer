import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { annotationField } from '../editor/annotation-state'
import { createEditorExtensions, fontSizeCompartment, readOnlyCompartment, themeCompartment } from '../editor/editor-setup'
import { fountainDarkTheme, fountainLightTheme } from '../editor/fountain-theme'
import { useCodeMirror } from '../editor/use-codemirror'
import { saveToDB } from '../lib/persistence'
import type { AnalysisPhase } from '../lib/script-analysis'
import { useAIStore } from '../store/ai-store'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'
import { AnnotationPopup } from './AnnotationPopup'
import { HeroSection } from './HeroSection'

interface EditorPanelProps {
  focusMode: boolean
}

export function EditorPanel(_props: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { content, fileName, setStats, setCursorLine, updateContent } = useEditorStore()
  const { theme, fontSize, zoomLevel, editorMode } = useSettingsStore()
  const analysisStatus = useAIStore((s) => s.analysisState.status)
  const isAnalyzing = analysisStatus === 'sending' || analysisStatus === 'analyzing'
  const [selectionData, setSelectionData] = useState<{ from: number; to: number; text: string } | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)

  // Debounce timer ref for auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track previous fileName to detect when a new file is opened
  const prevFileNameRef = useRef<string | null>(fileName)

  const onUpdate = useCallback(
    ({ doc, cursorLine, selection }: { doc: string; cursorLine: number; selection: { from: number; to: number } }) => {
      setCursorLine(cursorLine)
      updateContent(doc)

      // Compute stats
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

      // Sync annotations from CM6 to Zustand (for React sidebar)
      const storeView = useEditorStore.getState().viewRef?.current
      if (storeView) {
        try {
          const anns = storeView.state.field(annotationField).annotations
          useAnnotationStore.getState().syncFromEditor(anns)
        } catch {
          // annotationField may not be available yet during initialization
        }
      }

      // Auto-save to IndexedDB (2s debounce)
      // Read fileName from store directly — same stale closure issue
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const currentFileName = useEditorStore.getState().fileName
        if (currentFileName) {
          saveToDB(currentFileName, doc)
        }
      }, 2000)
    },
    [setStats, setCursorLine, updateContent],
  )

  const extensions = createEditorExtensions(theme, 'edit', 14, onUpdate)
  const viewRef = useCodeMirror(containerRef, content ?? '', extensions)

  // Load new content into CM6 when a different file is opened
  useEffect(() => {
    const view = viewRef.current
    if (!view || !content) return
    if (fileName !== prevFileNameRef.current) {
      prevFileNameRef.current = fileName
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
    }
  }, [fileName, content, viewRef])

  // Theme switching via Compartment
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const newTheme = theme === 'dark' ? fountainDarkTheme : fountainLightTheme
    view.dispatch({
      effects: themeCompartment.reconfigure(newTheme),
    })
  }, [theme, viewRef])

  // Mode switching via readOnlyCompartment
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(editorMode === 'annotate')),
    })
  }, [editorMode, viewRef])

  // Expose viewRef to store for episode navigation scrolling
  useEffect(() => {
    useEditorStore.getState().setViewRef(viewRef)
    return () => useEditorStore.getState().setViewRef({ current: null })
  }, [viewRef])

  // Show annotation popup on mouseup (not during drag) in annotate mode
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = () => {
      const view = viewRef.current
      if (!view) return
      const currentMode = useSettingsStore.getState().editorMode
      if (currentMode !== 'annotate') return
      const sel = view.state.selection.main
      if (sel.from === sel.to) return
      const doc = view.state.doc.toString()
      const selectedText = doc.slice(sel.from, sel.to)
      if (selectedText.trim().length < 3) return
      setSelectionData({ from: sel.from, to: sel.to, text: selectedText })
      const coords = view.coordsAtPos(sel.to)
      if (coords) {
        setPopupPosition({ x: coords.left, y: coords.bottom })
      }
    }
    container.addEventListener('mouseup', handler)
    return () => container.removeEventListener('mouseup', handler)
  }, [viewRef])

  // Open popup when editing an existing annotation (triggered by Edit button on AnnotationCard)
  const { editingAnnotation } = useAnnotationStore()

  useEffect(() => {
    if (!editingAnnotation || !viewRef.current) return
    const coords = viewRef.current.coordsAtPos(editingAnnotation.to)
    if (coords) {
      setSelectionData({
        from: editingAnnotation.from,
        to: editingAnnotation.to,
        text: editingAnnotation.selectedText,
      })
      setPopupPosition({ x: coords.left, y: coords.bottom })
    }
  }, [editingAnnotation, viewRef])

  // Apply zoom: font size via CM6 compartment (triggers line-height recalc),
  // layout scale via CSS variable (margins, maxWidth, spacing scale proportionally
  // so line wrapping stays constant across zoom levels — true magnification).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const zoomFactor = zoomLevel / 100
    const effectiveSize = Math.round(fontSize * zoomFactor)
    view.dom.style.setProperty('--zoom-scale', String(zoomFactor))
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({
          '&': { fontSize: `${effectiveSize}px` },
          '.cm-content': { fontSize: `${effectiveSize}px` },
        }),
      ),
    })
  }, [fontSize, zoomLevel, viewRef])

  return (
    <>
      <div className="h-full overflow-auto" style={{ position: 'relative' }}>
        <HeroSection />
        <div ref={containerRef} />
        {isAnalyzing && <div className="analysis-scanline" />}
      </div>
      {((selectionData && popupPosition && editorMode === 'annotate') || editingAnnotation) && (
        <AnnotationPopup
          selection={selectionData}
          position={popupPosition}
          onClose={() => {
            setSelectionData(null)
            setPopupPosition(null)
          }}
          onAIRewrite={() => {
            if (!selectionData || !viewRef.current) return
            const doc = viewRef.current.state.doc.toString()
            // Get 500 chars of context before and after selection
            const contextStart = Math.max(0, selectionData.from - 500)
            const contextEnd = Math.min(doc.length, selectionData.to + 500)
            const context = doc.slice(contextStart, contextEnd)

            useAIStore.getState().setRewriteSelection({
              from: selectionData.from,
              to: selectionData.to,
              text: selectionData.text,
              context,
            })
          }}
        />
      )}
    </>
  )
}
