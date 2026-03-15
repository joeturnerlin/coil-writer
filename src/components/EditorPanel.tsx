import { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef } from 'react'
import { annotationField } from '../editor/annotation-state'
import {
  createEditorExtensions,
  fontSizeCompartment,
  subtextCompartment,
  themeCompartment,
} from '../editor/editor-setup'
import { fountainDarkTheme, fountainLightTheme } from '../editor/fountain-theme'
import { subtextExtension } from '../editor/subtext-decorations'
import { useCodeMirror } from '../editor/use-codemirror'
import { saveToDB } from '../lib/persistence'
import { useAIStore } from '../store/ai-store'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSettingsStore } from '../store/settings-store'
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

  // Debounce timer ref for auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track previous fileName to detect when a new file is opened
  const prevFileNameRef = useRef<string | null>(fileName)

  const onUpdate = useCallback(
    ({ doc, cursorLine, selection }: { doc: string; cursorLine: number; selection: { from: number; to: number } }) => {
      setCursorLine(cursorLine)
      updateContent(doc)

      // Update scene model (debounced internally by script-store)
      useScriptStore.getState().updateFromContent(doc)

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

  const extensions = createEditorExtensions(theme, 'write', 14, onUpdate)
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
      // Force scene model update on file open (onUpdate only fires on edits)
      useScriptStore.getState().forceUpdate(content)
    }
  }, [fileName, content, viewRef])

  // Also populate scene model on initial load (auto-recovery)
  useEffect(() => {
    if (content) {
      useScriptStore.getState().forceUpdate(content)
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

  // In AI Assist mode, selecting text goes straight to AI rewrite
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = () => {
      const view = viewRef.current
      if (!view) return
      const currentMode = useSettingsStore.getState().editorMode
      if (currentMode !== 'analyze') return
      const sel = view.state.selection.main
      if (sel.from === sel.to) return
      const doc = view.state.doc.toString()
      const selectedText = doc.slice(sel.from, sel.to)
      if (selectedText.trim().length < 20) return

      // Open AI rewrite popup directly
      const contextStart = Math.max(0, sel.from - 500)
      const contextEnd = Math.min(doc.length, sel.to + 500)
      const context = doc.slice(contextStart, contextEnd)
      useAIStore.getState().setRewriteSelection({
        from: sel.from,
        to: sel.to,
        text: selectedText,
        context,
      })
    }
    container.addEventListener('mouseup', handler)
    return () => container.removeEventListener('mouseup', handler)
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
    <div style={{ position: 'relative', height: '100%' }}>
      <div className="h-full overflow-auto">
        <HeroSection />
        <div ref={containerRef} />
      </div>
      {isAnalyzing && <div className="analysis-scanline" />}
    </div>
  )
}
