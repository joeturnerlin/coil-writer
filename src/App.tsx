import { useEffect, useRef, useState } from 'react'
import { AIRewritePopup } from './components/AIRewritePopup'
// AnalysisPanel removed — status now in CharacterHub StatusLog
import { ContextualLeftPanel } from './components/ContextualLeftPanel'
import { ContextualRightPanel } from './components/ContextualRightPanel'
import { ConversionWarnings } from './components/ConversionWarnings'
import { DualRewritePopup } from './components/DualRewritePopup'
import { EditorPanel } from './components/EditorPanel'
import { FileDropZone } from './components/FileDropZone'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { SettingsDialog } from './components/SettingsDialog'
import { StashDrawer } from './components/StashDrawer'
import { StatsBar } from './components/StatsBar'
import { Toolbar } from './components/Toolbar'
import { TypeIndicator } from './components/TypeIndicator'
import { getRecoveredDocument } from './lib/persistence'
import { useEditorStore } from './store/editor-store'
import { useOnboardingStore } from './store/onboarding-store'
import { useSettingsStore } from './store/settings-store'

export function App() {
  const { fileName, content, importWarnings, importFormat } = useEditorStore()
  const { theme, showEpisodeNav, showAnnotations, editorMode, onboardingComplete, setOnboardingComplete } =
    useSettingsStore()
  const tourStep = useOnboardingStore((s) => s.tourStep)
  const [focusMode, setFocusMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const hasDocument = content !== null

  // Track when tour completes to mark onboarding done
  const prevTourStep = useRef(tourStep)
  useEffect(() => {
    // Tour just ended (went from a step to null) and onboarding not yet marked complete
    if (prevTourStep.current !== null && tourStep === null && !onboardingComplete) {
      setOnboardingComplete(true)
    }
    prevTourStep.current = tourStep
  }, [tourStep, onboardingComplete, setOnboardingComplete])

  // Auto-recover last document on startup
  useEffect(() => {
    if (hasDocument) return
    getRecoveredDocument().then((doc) => {
      if (doc) {
        useEditorStore.getState().openFile(doc.fileName, doc.content)
      }
    })
  }, [])

  // Keyboard shortcuts: focus mode + zoom
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setFocusMode((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setFocusMode(false)
      }
      if (e.metaKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useSettingsStore.getState().zoomIn()
      }
      if (e.metaKey && e.key === '-') {
        e.preventDefault()
        useSettingsStore.getState().zoomOut()
      }
      if (e.metaKey && e.key === '0') {
        e.preventDefault()
        useSettingsStore.getState().resetZoom()
      }
      if (e.metaKey && e.key === 'e') {
        e.preventDefault()
        const current = useSettingsStore.getState().editorMode
        useSettingsStore.getState().setEditorMode(current === 'write' ? 'analyze' : 'write')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Toolbar — hidden in focus mode */}
      {!focusMode && (
        <Toolbar
          onToggleFocus={() => setFocusMode((f) => !f)}
          onOpenSettings={() => setSettingsOpen(true)}
          focusMode={focusMode}
        />
      )}

      {/* Conversion warnings toast */}
      {!focusMode && importWarnings.length > 0 && (
        <ConversionWarnings
          warnings={importWarnings}
          format={importFormat || ''}
          onDismiss={() => useEditorStore.getState().clearImportWarnings()}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — contextual by mode */}
        {!focusMode && showEpisodeNav && hasDocument && <ContextualLeftPanel />}

        {/* Editor or drop zone — center */}
        <div className="flex-1 overflow-hidden">
          {hasDocument ? <EditorPanel focusMode={focusMode} /> : <FileDropZone />}
        </div>

        {/* Right panel — contextual by mode */}
        {!focusMode && hasDocument && (editorMode === 'analyze' || showAnnotations) && <ContextualRightPanel />}
      </div>

      {/* Stash drawer — between editor and stats bar */}
      {hasDocument && <StashDrawer />}

      {/* Bottom bar — hidden in focus mode */}
      {!focusMode && hasDocument && <StatsBar />}

      {/* Type indicator — always visible when document loaded */}
      {hasDocument && <TypeIndicator />}

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* AI Rewrite popup */}
      <AIRewritePopup />

      {/* Dual rewrite comparison popup */}
      <DualRewritePopup />

      {/* Analysis panel removed — status now in CharacterHub StatusLog */}

      {/* Onboarding overlay */}
      {!onboardingComplete && hasDocument && tourStep !== null && <OnboardingOverlay />}

      {/* Focus mode escape hint */}
      {focusMode && (
        <div
          className="fixed top-4 right-4 text-xs opacity-30 hover:opacity-70 transition-opacity cursor-pointer select-none"
          style={{ color: theme === 'dark' ? '#888' : '#666' }}
          onClick={() => setFocusMode(false)}
        >
          ESC or Cmd+Shift+F to exit
        </div>
      )}
    </div>
  )
}
