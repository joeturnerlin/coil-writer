import { Columns3, LayoutList } from 'lucide-react'
import type { AnalyzeLeftTab } from '../editor/types'
import { useSettingsStore } from '../store/settings-store'
import { BeatBoard } from './BeatBoard'
import { EpisodeNavigator } from './EpisodeNavigator'
import { StructurePanel } from './StructurePanel'

export function ContextualLeftPanel() {
  const { editorMode, activeLeftTab, setActiveLeftTab } = useSettingsStore()

  if (editorMode === 'write') {
    return <EpisodeNavigator />
  }

  // Analyze mode
  return (
    <div
      style={{
        width: '180px',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          padding: '4px',
        }}
      >
        <TabButton
          icon={<LayoutList size={12} />}
          label="Structure"
          active={activeLeftTab === 'structure'}
          onClick={() => setActiveLeftTab('structure')}
        />
        <TabButton
          icon={<Columns3 size={12} />}
          label="Board"
          active={activeLeftTab === 'beatboard'}
          onClick={() => setActiveLeftTab('beatboard')}
        />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeLeftTab === 'structure' ? <StructurePanel /> : activeLeftTab === 'beatboard' ? <BeatBoard /> : null}
      </div>
    </div>
  )
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      style={{
        flex: 1,
        fontSize: '9px',
        padding: '4px 0',
        border: 'none',
        borderRadius: 'var(--btn-radius)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--mode-analyze-text)' : 'var(--text-dim)',
        background: active ? 'var(--mode-analyze-bg)' : 'transparent',
      }}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}
