import { EditorView } from '@codemirror/view'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Episode } from '../editor/types'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'
import { useSettingsStore } from '../store/settings-store'

interface SceneItem {
  index: number
  title: string
  startPos: number
}

export function EpisodeNavigator() {
  const { content, viewRef, stats } = useEditorStore()
  const { toggleEpisodeNav } = useSettingsStore()
  const { annotations } = useAnnotationStore()
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [scenes, setScenes] = useState<SceneItem[]>([])
  const [activeEpisode, setActiveEpisode] = useState<number>(0)
  const [activeScene, setActiveScene] = useState<number>(-1)

  // Extract episodes, or fall back to scenes for regular screenplays
  useEffect(() => {
    if (!content) return
    const eps: Episode[] = []
    const scn: SceneItem[] = []
    const lines = content.split('\n')
    let pos = 0
    let sceneIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const match = line.match(/^\[\[EPISODE\s+(\d+):\s*(.+?)\]\]$/i) || line.match(/^\[\[EPISODE\s+(\d+)\]\]$/i)
      if (match) {
        eps.push({
          number: Number.parseInt(match[1], 10),
          title: match[2] || `Episode ${match[1]}`,
          startPos: pos,
        })
      }
      // Also collect scene headings for fallback
      if (
        /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(line) ||
        (line.startsWith('.') && line.length > 1 && line[1] !== '.')
      ) {
        sceneIndex++
        const title = line.startsWith('.') ? line.slice(1).trim() : line
        scn.push({ index: sceneIndex, title, startPos: pos })
      }
      pos += lines[i].length + 1
    }
    setEpisodes(eps)
    setScenes(scn)
  }, [content])

  const isSceneMode = episodes.length === 0 && scenes.length > 0

  // Track active episode/scene by scroll position (viewport top), not cursor
  useEffect(() => {
    const view = viewRef?.current
    const items = isSceneMode ? scenes : episodes
    if (!view || items.length === 0) return

    const updateFromScroll = () => {
      // Use lineBlockAtHeight to get the document position at the top of the visible area
      const scrollTop = view.scrollDOM.scrollTop
      const topBlock = view.lineBlockAtHeight(scrollTop)
      const topPos = topBlock.from
      if (isSceneMode) {
        let found = false
        for (let i = scenes.length - 1; i >= 0; i--) {
          if (scenes[i].startPos <= topPos) {
            setActiveScene(scenes[i].index)
            found = true
            break
          }
        }
        if (!found) setActiveScene(-1)
      } else {
        let found = false
        for (let i = episodes.length - 1; i >= 0; i--) {
          if (episodes[i].startPos <= topPos) {
            setActiveEpisode(episodes[i].number)
            found = true
            break
          }
        }
        if (!found) setActiveEpisode(0)
      }
    }

    updateFromScroll()
    const scroller = view.scrollDOM
    scroller.addEventListener('scroll', updateFromScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', updateFromScroll)
  }, [viewRef, episodes, scenes, isSceneMode])

  // Count annotations per episode
  const annotationCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const ann of annotations) {
      for (let i = episodes.length - 1; i >= 0; i--) {
        if (episodes[i].startPos <= ann.from) {
          counts[episodes[i].number] = (counts[episodes[i].number] || 0) + 1
          break
        }
      }
    }
    return counts
  }, [annotations, episodes])

  const scrollToPosition = (pos: number) => {
    const view = viewRef?.current
    if (!view) return
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 10 }),
    })
    const scroller = view.scrollDOM
    scroller.style.scrollBehavior = 'smooth'
    setTimeout(() => { scroller.style.scrollBehavior = '' }, 500)
    view.focus()
  }

  return (
    <div
      style={{
        width: '180px',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {isSceneMode ? 'Scenes' : 'Episodes'}
        </span>
        <button
          style={{
            padding: '2px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '3px',
          }}
          onClick={toggleEpisodeNav}
          type="button"
        >
          <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Navigation list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {/* Title page entry (episodes mode only) */}
        {episodes.length > 0 && (
          <button
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              background: activeEpisode === 0 ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              borderLeftStyle: 'solid',
              borderLeftWidth: '2px',
              borderLeftColor: activeEpisode === 0 ? 'var(--color-episode)' : 'transparent',
              transition: 'background 0.1s ease',
              fontFamily: 'inherit',
              marginBottom: '4px',
            }}
            onClick={() => {
              scrollToPosition(0)
              setActiveEpisode(0)
            }}
            type="button"
          >
            <div
              style={{
                fontWeight: 600,
                color: activeEpisode === 0 ? 'var(--color-episode)' : 'var(--text-secondary)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Title Page
            </div>
          </button>
        )}

        {/* Episode items */}
        {episodes.map((ep) => {
          const isActive = activeEpisode === ep.number
          const count = annotationCounts[ep.number] || 0
          return (
            <button
              key={ep.number}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                border: 'none',
                borderLeftStyle: 'solid',
                borderLeftWidth: '2px',
                borderLeftColor: isActive ? 'var(--color-episode)' : 'transparent',
                transition: 'background 0.1s ease',
                fontFamily: 'inherit',
              }}
              onClick={() => {
                scrollToPosition(ep.startPos)
                setActiveEpisode(ep.number)
              }}
              type="button"
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    color: isActive ? 'var(--color-episode)' : 'var(--text-secondary)',
                    fontSize: '11px',
                  }}
                >
                  EP {String(ep.number).padStart(2, '0')}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    marginTop: '2px',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '130px',
                  }}
                >
                  {ep.title}
                </div>
              </div>
              {count > 0 && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    background: 'var(--accent-cyan-dim)',
                    color: 'var(--accent-cyan)',
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Scene items (fallback when no episodes) */}
        {isSceneMode &&
          scenes.map((sc) => {
            const isActive = activeScene === sc.index
            return (
              <button
                key={sc.index}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderLeftStyle: 'solid',
                  borderLeftWidth: '2px',
                  borderLeftColor: isActive ? 'var(--color-scene-heading)' : 'transparent',
                  transition: 'background 0.1s ease',
                  fontFamily: 'inherit',
                }}
                onClick={() => {
                  scrollToPosition(sc.startPos)
                  setActiveScene(sc.index)
                }}
                type="button"
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: isActive ? 'var(--color-scene-heading)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '150px',
                    textTransform: 'uppercase',
                  }}
                >
                  {sc.title}
                </div>
              </button>
            )
          })}

        {episodes.length === 0 && scenes.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: '10px', color: 'var(--text-muted)' }}>
            No scenes or episodes found
          </div>
        )}
      </div>

      {/* Stats footer */}
      {stats && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Lines</span>
            <span style={{ color: 'var(--text-secondary)' }}>{stats.lineCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Scenes</span>
            <span style={{ color: 'var(--text-secondary)' }}>{stats.sceneCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Dialogue</span>
            <span style={{ color: 'var(--text-secondary)' }}>{stats.dialoguePercentage}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Notes</span>
            <span style={{ color: 'var(--accent-cyan)' }}>{annotations.length}</span>
          </div>
        </div>
      )}
    </div>
  )
}
