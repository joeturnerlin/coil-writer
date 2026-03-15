/**
 * StructurePanel — Left panel in Analyze mode (structure tab).
 *
 * 180px wide vertical strip map. Shows framework selector, analyze button,
 * scene cells with beat mappings, gap warnings, and timing estimates.
 */

import { EditorView } from '@codemirror/view'
import { useCallback, useRef, useState } from 'react'
import type { StructureFramework } from '../editor/types'
import type { SceneBlock } from '../lib/scene-model'
import type { BeatMapping, GapWarning, StructureResult } from '../lib/structure-analysis'
import { analyzeStructure } from '../lib/structure-analysis'
import { useEditorStore } from '../store/editor-store'
import { useScriptStore } from '../store/script-store'
import { useSettingsStore } from '../store/settings-store'
import { useSubscriptionStore } from '../store/subscription-store'

// ── Beat category colors ──

const CATEGORY_COLORS: Record<string, string> = {
  setup: '#4fc3f7',
  catalyst: '#ff9800',
  conflict: '#ef5350',
  resolution: '#4caf50',
}

const UNMAPPED_COLOR = '#666'

function beatColor(category?: string): string {
  return (category && CATEGORY_COLORS[category]) || UNMAPPED_COLOR
}

// ── Framework display names ──

const FRAMEWORK_OPTIONS: { value: StructureFramework; label: string }[] = [
  { value: 'save-the-cat', label: 'Save the Cat!' },
  { value: 'heros-journey', label: "Hero's Journey" },
  { value: 'story-structure', label: 'Story Structure' },
  { value: 'sequence', label: 'Sequence' },
]

// ── Timing heuristics ──

function estimateRuntime(scene: SceneBlock): string {
  const seconds = scene.actionLines * 4 + scene.dialogueLines * 2.5
  if (seconds < 60) return `~${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`
}

// ── Main component ──

export function StructurePanel() {
  const scenes = useScriptStore((s) => s.scenes)
  const { structureFramework, setStructureFramework } = useSettingsStore()
  const viewRef = useEditorStore((s) => s.viewRef)
  const canUseGaps = useSubscriptionStore((s) => s.canUse('structure-gaps'))

  const [result, setResult] = useState<StructureResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleAnalyze = useCallback(async () => {
    if (scenes.length === 0) return

    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await analyzeStructure(scenes, structureFramework, controller.signal)
      setResult(res)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || 'Analysis failed')
      }
    } finally {
      setLoading(false)
    }
  }, [scenes, structureFramework])

  const scrollToScene = useCallback(
    (scene: SceneBlock) => {
      const view = viewRef?.current
      if (!view) return
      view.dispatch({
        selection: { anchor: scene.from },
        effects: EditorView.scrollIntoView(scene.from, { y: 'start', yMargin: 10 }),
      })
      const scroller = view.scrollDOM
      scroller.style.scrollBehavior = 'smooth'
      setTimeout(() => { scroller.style.scrollBehavior = '' }, 500)
      view.focus()
    },
    [viewRef],
  )

  // Build lookup maps from analysis result
  const mappingByScene = new Map<number, BeatMapping>()
  const beatCategoryById = new Map<string, string>()
  if (result) {
    for (const m of result.mappings) {
      mappingByScene.set(m.sceneIndex, m)
    }
  }

  // Load beat categories from framework (lazy — cached per render)
  // We need category info for coloring. Parse it from the JSON import cache.
  // Since we already analyzed, we can derive category from the framework option.
  // For simplicity, store category in a side-loaded map.
  const [beatCategories, setBeatCategories] = useState<Map<string, string>>(new Map())

  // Load categories when framework changes or analysis completes
  const loadCategories = useCallback(async (fwId: string) => {
    try {
      const fw = (await import(`../lib/frameworks/${fwId}.json`)).default
      const cats = new Map<string, string>()
      for (const b of fw.beats) {
        cats.set(b.id, b.category)
      }
      setBeatCategories(cats)
    } catch {
      // Silently fail
    }
  }, [])

  // Trigger category load on analyze
  const handleAnalyzeWithCategories = useCallback(async () => {
    await loadCategories(structureFramework)
    await handleAnalyze()
  }, [loadCategories, structureFramework, handleAnalyze])

  // Interleave scenes with gap warnings (sorted by expected position)
  const renderItems: Array<
    { type: 'scene'; scene: SceneBlock; mapping?: BeatMapping } | { type: 'gap'; warning: GapWarning }
  > = []

  const filteredScenes = scenes.filter((s) => s.heading)
  const totalScenes = filteredScenes.length

  if (result) {
    // Insert gap warnings at approximate positions
    const gapsByPosition = canUseGaps ? [...result.gaps].sort((a, b) => a.expectedPosition - b.expectedPosition) : []

    let gapIdx = 0
    for (let i = 0; i < filteredScenes.length; i++) {
      const scenePosition = totalScenes > 1 ? i / (totalScenes - 1) : 0

      // Insert any gap warnings that should appear before this scene
      while (gapIdx < gapsByPosition.length && gapsByPosition[gapIdx].expectedPosition <= scenePosition + 0.01) {
        renderItems.push({ type: 'gap', warning: gapsByPosition[gapIdx] })
        gapIdx++
      }

      renderItems.push({
        type: 'scene',
        scene: filteredScenes[i],
        mapping: mappingByScene.get(filteredScenes[i].index),
      })
    }

    // Remaining gaps at the end
    while (gapIdx < gapsByPosition.length) {
      renderItems.push({ type: 'gap', warning: gapsByPosition[gapIdx] })
      gapIdx++
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Framework selector */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
        <select
          value={structureFramework}
          onChange={(e) => setStructureFramework(e.target.value as StructureFramework)}
          style={{
            width: '100%',
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '4px 6px',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--btn-radius)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {FRAMEWORK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleAnalyzeWithCategories}
          disabled={loading || scenes.length === 0}
          type="button"
          style={{
            width: '100%',
            marginTop: '6px',
            padding: '5px 0',
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            background: loading ? 'var(--bg-hover)' : 'var(--mode-analyze-bg)',
            color: loading ? 'var(--text-dim)' : 'var(--mode-analyze-text)',
            border: 'none',
            borderRadius: 'var(--btn-radius)',
            cursor: loading || scenes.length === 0 ? 'default' : 'pointer',
            opacity: scenes.length === 0 ? 0.4 : 1,
          }}
        >
          {loading ? 'Analyzing...' : 'Analyze Structure'}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            padding: '16px 8px',
            textAlign: 'center',
            fontSize: '9px',
            color: 'var(--text-dim)',
          }}
        >
          <div
            style={{
              height: '2px',
              background: 'var(--border-color)',
              borderRadius: '1px',
              overflow: 'hidden',
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '40%',
                background: 'var(--mode-analyze-text)',
                borderRadius: '1px',
                animation: 'scanline 1.5s ease-in-out infinite',
              }}
            />
          </div>
          Mapping beats...
          <style>{`
            @keyframes scanline {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
          `}</style>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '8px',
            fontSize: '9px',
            color: 'var(--structure-gap, #ef5350)',
          }}
        >
          {error}
        </div>
      )}

      {/* Scene cells */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!result && !loading && (
          <div
            style={{
              padding: '16px 8px',
              textAlign: 'center',
              fontSize: '9px',
              color: 'var(--text-dim)',
            }}
          >
            {scenes.length === 0 ? 'No scenes found' : 'Select a framework and analyze'}
          </div>
        )}

        {result &&
          renderItems.map((item, idx) => {
            if (item.type === 'gap') {
              return <GapWarningCell key={`gap-${item.warning.beatId}`} warning={item.warning} />
            }

            const { scene, mapping } = item
            const category = mapping ? beatCategories.get(mapping.beatId) : undefined
            const color = mapping ? beatColor(category) : UNMAPPED_COLOR

            return (
              <SceneCell
                key={`scene-${scene.index}`}
                scene={scene}
                mapping={mapping}
                color={color}
                category={category}
                onClick={() => scrollToScene(scene)}
              />
            )
          })}
      </div>

      {/* Pro gate for gaps */}
      {result && !canUseGaps && result.gaps.length > 0 && (
        <div
          style={{
            padding: '8px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '9px',
            color: 'var(--text-dim)',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          Upgrade for gap analysis
        </div>
      )}
    </div>
  )
}

// ── Scene cell ──

function SceneCell({
  scene,
  mapping,
  color,
  category,
  onClick,
}: {
  scene: SceneBlock
  mapping?: BeatMapping
  color: string
  category?: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const totalLines = scene.dialogueLines + scene.actionLines
  const dialogueRatio = totalLines > 0 ? scene.dialogueLines / totalLines : 0

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '6px 8px 6px 11px',
        border: 'none',
        borderLeft: `3px solid ${color}`,
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'background 0.1s ease',
      }}
    >
      {/* Beat tag pill + timing */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
        {mapping ? (
          <span
            style={{
              fontSize: '8px',
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: '3px',
              background: `${color}22`,
              color: color,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100px',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {mapping.beatId.replace(/-/g, ' ')}
          </span>
        ) : (
          <span
            style={{
              fontSize: '8px',
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'var(--bg-hover)',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            unmapped
          </span>
        )}
        <span
          style={{
            fontSize: '8px',
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {estimateRuntime(scene)}
        </span>
      </div>

      {/* Scene heading */}
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '148px',
        }}
      >
        {scene.heading}
      </div>

      {/* AI summary */}
      {mapping?.summary && (
        <div
          style={{
            fontSize: '9px',
            color: 'var(--text-dim)',
            lineHeight: '1.3',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {mapping.summary}
        </div>
      )}

      {/* Dialogue/action ratio bar */}
      <div
        style={{
          height: '4px',
          width: '100%',
          borderRadius: '2px',
          background: 'var(--bg-hover)',
          marginTop: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.round(dialogueRatio * 100)}%`,
            background: '#4fc3f7',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </button>
  )
}

// ── Gap warning cell ──

function GapWarningCell({ warning }: { warning: GapWarning }) {
  return (
    <div
      style={{
        padding: '4px 8px 4px 11px',
        borderLeft: '3px dashed var(--structure-gap, #ef5350)',
      }}
    >
      <div
        style={{
          fontSize: '9px',
          fontStyle: 'italic',
          color: 'var(--structure-gap, #ef5350)',
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: '1.3',
        }}
      >
        {warning.message}
      </div>
    </div>
  )
}
