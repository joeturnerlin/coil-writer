import { useMemo } from 'react'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'

interface TitlePageData {
  title?: string
  credit?: string
  author?: string
  draftDate?: string
}

function parseTitlePage(content: string): TitlePageData | null {
  const separatorIdx = content.indexOf('\n===')
  if (separatorIdx === -1) return null

  const titleBlock = content.slice(0, separatorIdx)
  const data: TitlePageData = {}

  for (const line of titleBlock.split('\n')) {
    const match = line.match(/^(\w[\w\s]*?):\s*(.+)$/i)
    if (match) {
      const key = match[1].trim().toLowerCase()
      const value = match[2].trim()
      if (key === 'title') data.title = value
      else if (key === 'credit') data.credit = value
      else if (key === 'author') data.author = value
      else if (key === 'draft date') data.draftDate = value
    }
  }

  return data.title ? data : null
}

export function HeroSection() {
  const { content, stats } = useEditorStore()
  const { annotations } = useAnnotationStore()

  const titleData = useMemo(() => {
    if (!content) return null
    return parseTitlePage(content)
  }, [content])

  if (!titleData) return null

  const episodeCount = stats?.episodeCount ?? 0
  const wordCount = stats?.wordCount ?? 0
  const wordDisplay = wordCount >= 1000 ? `${Math.round(wordCount / 1000)}K` : String(wordCount)
  const noteCount = annotations.length

  return (
    <div
      className="select-none"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '48px 48px 32px',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--hero-bg-glow)',
          pointerEvents: 'none',
        }}
      />

      {/* Title */}
      <h1
        style={{
          fontFamily: "'Orbitron', monospace",
          fontSize: 'var(--hero-title-size)',
          fontWeight: 900,
          letterSpacing: 'var(--hero-title-spacing)',
          color: 'var(--text-primary)',
          textShadow: 'var(--hero-title-glow)',
          textTransform: 'uppercase',
          textAlign: 'center',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {titleData.title}
      </h1>

      {/* Credit */}
      {titleData.credit && (
        <p
          style={{
            marginTop: '16px',
            fontSize: '14px',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          {titleData.credit}
        </p>
      )}

      {/* Stats row */}
      {episodeCount > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '48px',
            marginTop: '32px',
            justifyContent: 'center',
          }}
        >
          <StatBlock value={String(episodeCount)} label="Episodes" />
          <StatBlock value={wordDisplay} label="Words" />
          {noteCount > 0 && <StatBlock value={String(noteCount)} label="Script Doctor Notes" />}
        </div>
      )}

      {/* Author + date */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        {titleData.author && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' }}>{titleData.author}</p>
        )}
        {titleData.draftDate && (
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '4px 0' }}>{titleData.draftDate}</p>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          height: '1px',
          background: 'var(--border-color)',
          marginTop: '32px',
        }}
      />
    </div>
  )
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: "'Orbitron', monospace",
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--hero-stat-color)',
          textShadow: 'var(--hero-stat-glow)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: 'var(--text-dim)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginTop: '6px',
        }}
      >
        {label}
      </div>
    </div>
  )
}
