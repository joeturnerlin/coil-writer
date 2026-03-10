import {
  ChevronDown,
  Download,
  FileJson,
  FileText,
  List,
  Maximize2,
  MessageSquare,
  Minimize2,
  Palette,
  Pen,
  Settings,
  Sparkles,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { importFile, exportFile } from '../lib/converters/registry'
import { exportAnnotatedFountain, exportAnnotationsJSON } from '../lib/export'
import { openScriptFile, downloadFile, saveFountainFile } from '../lib/file-io'
import { CheatSheetButton } from './CheatSheet'
import { useAnalysis } from './AnalysisPanel'
import { useAIStore } from '../store/ai-store'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'
import { PRESET_LIST } from '../themes/presets'

interface ToolbarProps {
  onToggleFocus: () => void
  onOpenSettings: () => void
  focusMode?: boolean
}

export function Toolbar({ onToggleFocus, onOpenSettings, focusMode }: ToolbarProps) {
  const { fileName, content } = useEditorStore()
  const { preset, toggleTheme, zoomLevel, zoomIn, zoomOut, editorMode, setEditorMode, showEpisodeNav, toggleEpisodeNav } = useSettingsStore()
  const { annotations } = useAnnotationStore()
  const { currentProfile, analysisState } = useAIStore()
  const triggerAnalysis = useAnalysis()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const handleOpen = async () => {
    const file = await openScriptFile()
    if (file) {
      const result = await importFile(file.name, file.data)
      useEditorStore.getState().openFile(file.name, result.content)
      if (result.warnings.length > 0) {
        useEditorStore.getState().setImportWarnings(result.warnings, result.format)
      }
    }
  }

  const handleSaveFountain = () => {
    if (fileName && content) {
      saveFountainFile(fileName, content)
    }
  }

  const handleExportFDX = async () => {
    if (!fileName || !content) return
    setShowExportMenu(false)
    const result = await exportFile(content, 'fdx', fileName)
    const name = fileName.replace(/\.[^.]+$/, '') + result.extension
    downloadFile(result.data, name)
  }

  const handleExportJSON = () => {
    if (fileName && annotations.length > 0) {
      exportAnnotationsJSON(annotations, fileName)
    }
  }

  const handleExportFountain = () => {
    if (fileName && content && annotations.length > 0) {
      exportAnnotatedFountain(content, annotations, fileName)
    }
  }

  const hasAnnotations = annotations.length > 0
  const presetName = PRESET_LIST.find((p) => p.id === preset)?.name ?? 'Recoil'

  const sep = <div className="w-px h-5 mx-2" style={{ background: 'var(--border-color)' }} />

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 16px',
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--toolbar-border)',
        fontFamily: "'JetBrains Mono', 'Inter', -apple-system, sans-serif",
        fontSize: '12px',
        gap: '4px',
        minHeight: '44px',
      }}
    >
      {/* Brand */}
      <span
        style={{
          fontSize: '11px',
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          letterSpacing: '0.25em',
          color: 'var(--accent-cyan)',
          marginRight: '12px',
          userSelect: 'none',
        }}
      >
        COIL
      </span>

      {sep}

      {/* File ops */}
      <ToolbarButton onClick={handleOpen} icon={<Upload size={14} />} label="Open" />
      <div style={{ display: 'flex', position: 'relative' }} ref={exportMenuRef}>
        <ToolbarButton onClick={handleSaveFountain} icon={<Download size={14} />} label="Save" disabled={!content} />
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 4px',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '5px',
            color: !content ? 'var(--text-dim)' : 'var(--text-muted)',
            cursor: !content ? 'default' : 'pointer',
            opacity: !content ? 0.4 : 1,
            marginLeft: '-4px',
          }}
          onClick={() => content && setShowExportMenu(!showExportMenu)}
          type="button"
          title="Export formats"
          disabled={!content}
        >
          <ChevronDown size={12} />
        </button>
        {showExportMenu && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--card-radius)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 50,
              minWidth: '180px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              overflow: 'hidden',
            }}
          >
            <button
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              onClick={() => { handleSaveFountain(); setShowExportMenu(false) }}
              type="button"
            >
              Save as Fountain (.fountain)
            </button>
            <div style={{ height: '1px', background: 'var(--border-color)' }} />
            <button
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              onClick={handleExportFDX}
              type="button"
            >
              Export as Final Draft (.fdx)
            </button>
          </div>
        )}
      </div>

      {sep}

      {/* Mode toggle — segmented control */}
      <div
        style={{
          display: 'flex',
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
        }}
      >
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: editorMode === 'edit' ? 600 : 400,
            background: editorMode === 'edit' ? 'var(--accent-green)' : 'transparent',
            color: editorMode === 'edit' ? 'var(--accent-green-text)' : 'var(--text-dim)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
          onClick={() => setEditorMode('edit')}
          type="button"
        >
          <Pen size={12} />
          Edit
        </button>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: editorMode === 'annotate' ? 600 : 400,
            background: editorMode === 'annotate' ? 'var(--accent-blue)' : 'transparent',
            color: editorMode === 'annotate' ? 'var(--accent-blue-text)' : 'var(--text-dim)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
          onClick={() => setEditorMode('annotate')}
          type="button"
        >
          <MessageSquare size={12} />
          Annotate
        </button>
      </div>

      {sep}

      {/* Zoom */}
      <ToolbarButton onClick={zoomOut} icon={<ZoomOut size={14} />} title="Zoom out (Cmd+-)" />
      <span
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          minWidth: '38px',
          textAlign: 'center',
          userSelect: 'none',
          fontFamily: "'Courier Prime', monospace",
        }}
      >
        {zoomLevel}%
      </span>
      <ToolbarButton onClick={zoomIn} icon={<ZoomIn size={14} />} title="Zoom in (Cmd+=)" />

      {sep}

      {/* Preset */}
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: 500,
          background: 'var(--accent-cyan-dim)',
          border: '1px solid var(--accent-cyan)',
          borderRadius: '5px',
          color: 'var(--accent-cyan)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: 'inherit',
        }}
        onClick={toggleTheme}
        type="button"
        title="Cycle theme: Recoil → Muted → Light"
      >
        <Palette size={13} />
        {presetName}
      </button>

      {/* Analyze Script */}
      {content && (
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: currentProfile ? 600 : 500,
            background: currentProfile ? 'var(--accent-cyan-dim)' : 'transparent',
            border: currentProfile ? '1px solid var(--accent-cyan)' : '1px solid transparent',
            borderRadius: '5px',
            color: currentProfile ? 'var(--accent-cyan)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
            opacity: analysisState.status === 'analyzing' || analysisState.status === 'sending' ? 0.5 : 1,
          }}
          onClick={triggerAnalysis}
          disabled={analysisState.status === 'analyzing' || analysisState.status === 'sending'}
          type="button"
          title={currentProfile ? 'Re-analyze script voice profile' : 'Analyze script for voice profiles'}
        >
          <Sparkles size={14} />
          <span>{currentProfile ? 'Analyzed' : 'Analyze'}</span>
        </button>
      )}

      {/* Episode nav toggle */}
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: showEpisodeNav ? 600 : 500,
          background: showEpisodeNav ? 'var(--accent-cyan-dim)' : 'transparent',
          border: showEpisodeNav ? '1px solid var(--accent-cyan)' : '1px solid transparent',
          borderRadius: '5px',
          color: showEpisodeNav ? 'var(--accent-cyan)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
        }}
        onClick={toggleEpisodeNav}
        type="button"
        title={showEpisodeNav ? 'Hide navigation' : 'Show navigation'}
      >
        <List size={14} />
        <span>{content && !/\[\[EPISODE\s+\d+/i.test(content) ? 'Scenes' : 'Episodes'}</span>
      </button>

      {/* Focus */}
      <ToolbarButton
        onClick={onToggleFocus}
        icon={focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        title={focusMode ? 'Exit focus' : 'Focus mode'}
      />

      {/* Cheat sheet */}
      <CheatSheetButton />

      {/* Settings */}
      <ToolbarButton onClick={onOpenSettings} icon={<Settings size={14} />} title="Settings" />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Annotation exports */}
      {hasAnnotations && (
        <>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 600,
              background: 'var(--export-json-bg)',
              border: '1px solid var(--export-json-border)',
              borderRadius: '4px',
              color: 'var(--export-json-color)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onClick={handleExportJSON}
            type="button"
          >
            <FileJson size={11} />
            JSON
          </button>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 600,
              background: 'var(--export-fountain-bg)',
              border: '1px solid var(--export-fountain-border)',
              borderRadius: '4px',
              color: 'var(--export-fountain-color)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onClick={handleExportFountain}
            type="button"
          >
            <FileText size={11} />
            Fountain
          </button>
          <div className="w-px h-5 mx-2" style={{ background: 'var(--border-color)' }} />
        </>
      )}

      {/* Project name — extracted from filename */}
      {fileName && (
        <span
          style={{
            fontSize: '11px',
            fontFamily: "'Orbitron', monospace",
            fontWeight: 700,
            letterSpacing: '4px',
            color: 'var(--accent-cyan)',
            maxWidth: '220px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName.replace(/[_.].*$/, '').toUpperCase()}
        </span>
      )}
    </div>
  )
}

/** Reusable toolbar button */
function ToolbarButton({
  onClick,
  icon,
  label,
  title,
  disabled,
}: {
  onClick: () => void
  icon: React.ReactNode
  label?: string
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: label ? '4px 10px' : '4px 6px',
        fontSize: '11px',
        fontWeight: 500,
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: '5px',
        color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.4 : 1,
        fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        const t = e.currentTarget
        t.style.background = 'var(--bg-hover)'
        t.style.borderColor = 'var(--border-light)'
        t.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget
        t.style.background = 'transparent'
        t.style.borderColor = 'transparent'
        t.style.color = disabled ? 'var(--text-dim)' : 'var(--text-muted)'
      }}
      onClick={disabled ? undefined : onClick}
      type="button"
      title={title}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}
