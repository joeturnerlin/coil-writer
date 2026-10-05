import { MessageSquare } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'
import { NoteCard } from './NoteCard'

const CARD_H = 92
const GAP = 6
const MIN_CARD_W = 180
const MAX_CARD_W = 240
const MARKER = 20
const EDGE = 20 // keeps cards clear of the editor scrollbar

interface Placed {
  id: string
  y: number
}

interface Layout {
  mode: 'cards' | 'markers'
  cardW: number
  width: number
  height: number
  items: Placed[]
}

/**
 * Notes beside the line they belong to. The same store as the Notes panel; position comes from the passage's line
 * in the live editor view, so cards track scroll, zoom and edits. When the page leaves no room beside the text the
 * cards collapse to small markers (note on hover or click).
 */
export function MarginNotes() {
  const annotations = useAnnotationStore((s) => s.annotations)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const viewRef = useEditorStore((s) => s.viewRef)
  const zoomLevel = useSettingsStore((s) => s.zoomLevel)
  const layerRef = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const compute = useCallback(() => {
    const view = viewRef?.current
    const layer = layerRef.current
    if (!view || !layer) return
    const lr = layer.getBoundingClientRect()
    const textRight = view.contentDOM.getBoundingClientRect().right - lr.left
    const free = lr.width - textRight
    const mode: Layout['mode'] = free >= MIN_CARD_W + EDGE ? 'cards' : 'markers'
    const cardW = Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, free - EDGE - 4))
    const step = mode === 'cards' ? CARD_H + GAP : MARKER + 4
    // Live position: view.documentTop is cached from CodeMirror's last measure, which an outer scroller never refreshes
    const docTop = view.contentDOM.getBoundingClientRect().top + view.documentPadding.top
    const len = view.state.doc.length
    const sorted = [...useAnnotationStore.getState().annotations]
      .filter((a) => a.from < a.to)
      .sort((a, b) => a.from - b.from || a.to - b.to)
    const items: Placed[] = []
    let floor = Number.NEGATIVE_INFINITY
    for (const a of sorted) {
      const pos = Math.min(a.from, len)
      // The passage's own first visual line when it is rendered (the line block's top sits a few px higher, and a
      // wrapped line's block starts above the row the passage is on); the block estimate for far-off lines.
      const coords = view.coordsAtPos(pos, 1)
      const top = (coords ? coords.top : docTop + view.lineBlockAt(pos).top) - lr.top
      const y = Math.max(top, floor)
      floor = y + step
      items.push({ id: a.id, y })
    }
    setLayout({ mode, cardW, width: lr.width, height: lr.height, items })
  }, [viewRef])

  const schedule = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      compute()
    })
  }, [compute])

  useEffect(() => {
    const view = viewRef?.current
    const layer = layerRef.current
    if (!view || !layer) return
    // EditorPanel scrolls an outer wrapper (not view.scrollDOM) for tall scripts. Scroll doesn't bubble, so listen in
    // the capture phase on the layer's parent: that catches the editor's own scroller and every ancestor scroller.
    const host = layer.parentElement ?? layer
    host.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(layer)
    ro.observe(view.contentDOM)
    return () => {
      host.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      ro.disconnect()
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [viewRef, schedule])

  // Notes or selection changed, or zoom re-flowed the lines (line heights settle a frame later)
  // biome-ignore lint/correctness/useExhaustiveDependencies: annotations/selectedId/zoomLevel are the triggers
  useEffect(() => {
    schedule()
    const t = setTimeout(schedule, 120)
    return () => clearTimeout(t)
  }, [annotations, selectedId, zoomLevel, schedule])

  const byId = new Map(annotations.map((a) => [a.id, a]))
  const visible = (layout?.items ?? []).filter((i) => layout && i.y > -CARD_H && i.y < layout.height)

  return (
    <div
      ref={layerRef}
      className="margin-notes"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}
    >
      {layout &&
        visible.map((item) => {
          const note = byId.get(item.id)
          if (!note) return null
          const focused = selectedId === item.id
          if (layout.mode === 'cards') {
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: item.y,
                  left: layout.width - layout.cardW - EDGE,
                  width: layout.cardW,
                  maxHeight: focused ? undefined : CARD_H,
                  overflow: focused ? undefined : 'hidden',
                  zIndex: focused ? 2 : 1,
                  pointerEvents: 'auto',
                }}
              >
                <NoteCard
                  note={note}
                  focused={focused}
                  compact
                  onFocus={() => useAnnotationStore.getState().setSelectedId(note.id)}
                />
              </div>
            )
          }
          const open = focused || hoverId === item.id
          return (
            <div
              key={item.id}
              style={{ position: 'absolute', top: item.y, left: layout.width - MARKER - EDGE, pointerEvents: 'auto' }}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId((h) => (h === item.id ? null : h))}
            >
              <button
                type="button"
                title="Note"
                aria-label={`Note by ${note.author || 'Me'}`}
                onClick={() => useAnnotationStore.getState().setSelectedId(focused ? null : item.id)}
                style={{
                  width: MARKER,
                  height: MARKER,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  background: focused ? 'var(--accent-cyan)' : 'var(--accent-cyan-dim)',
                  border: '1px solid var(--accent-cyan)',
                  color: focused ? 'var(--bg-primary)' : 'var(--accent-cyan)',
                }}
              >
                <MessageSquare size={10} />
              </button>
              {open && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: MARKER + 6,
                    width: MAX_CARD_W + 10,
                    zIndex: 3,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  <NoteCard
                    note={note}
                    focused={focused}
                    compact
                    onFocus={() => useAnnotationStore.getState().setSelectedId(note.id)}
                  />
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
