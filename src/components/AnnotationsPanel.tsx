import { X } from 'lucide-react'
import { useMemo } from 'react'
import type { AnnotationAction, AnnotationSeverity } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useSettingsStore } from '../store/settings-store'
import { AnnotationCard } from './AnnotationCard'

export function AnnotationsPanel() {
  const {
    annotations,
    filterAction,
    setFilterAction,
    filterSeverity,
    setFilterSeverity,
    filterDimension,
    setFilterDimension,
  } = useAnnotationStore()
  const { toggleAnnotations } = useSettingsStore()

  // Collect unique dimensions from all annotations
  const allDimensions = useMemo(() => {
    const dims = new Set<string>()
    for (const a of annotations) {
      if (a.dimensions) {
        for (const d of a.dimensions) dims.add(d)
      }
    }
    return [...dims].sort()
  }, [annotations])

  // Apply all filters (AND logic)
  const filtered = annotations.filter((a) => {
    if (filterAction !== 'all' && a.action !== filterAction) return false
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false
    if (filterDimension !== 'all' && (!a.dimensions || !a.dimensions.includes(filterDimension))) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => a.from - b.from)

  const selectStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    padding: '6px 10px',
    borderRadius: 'var(--btn-radius)',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    appearance: 'none' as const,
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        width: 'var(--panel-annotation-width)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
          }}
        >
          Annotations ({annotations.length})
        </span>
        <button
          style={{
            padding: '4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 'var(--btn-radius)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={toggleAnnotations}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <select
          style={selectStyle}
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as AnnotationAction | 'all')}
        >
          <option value="all">All Actions</option>
          <option value="rewrite">Rewrite</option>
          <option value="delete">Delete</option>
          <option value="move">Move</option>
          <option value="flag">Flag</option>
        </select>
        <select
          style={selectStyle}
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as AnnotationSeverity | 'all')}
        >
          <option value="all">All Severity</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        {allDimensions.length > 0 && (
          <select
            style={selectStyle}
            value={filterDimension}
            onChange={(e) => setFilterDimension(e.target.value)}
          >
            <option value="all">All Dimensions</option>
            {allDimensions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {sorted.map((ann) => (
          <AnnotationCard key={ann.id} annotation={ann} />
        ))}
        {sorted.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {annotations.length === 0 ? 'Select text to create annotations' : 'No annotations match filter'}
          </div>
        )}
      </div>
    </div>
  )
}
