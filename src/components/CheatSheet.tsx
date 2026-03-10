import { HelpCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function CheatSheetButton() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 6px',
          fontSize: '11px',
          fontWeight: 500,
          background: open ? 'var(--bg-hover)' : 'transparent',
          border: open ? '1px solid var(--border-light)' : '1px solid transparent',
          borderRadius: '5px',
          color: open ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--border-light)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }
        }}
        onClick={() => setOpen(!open)}
        type="button"
        title="Writing tips & shortcuts"
      >
        <HelpCircle size={14} />
      </button>
      {open && <CheatSheetPanel onClose={() => setOpen(false)} />}
    </div>
  )
}

function CheatSheetPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '6px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--card-radius, 8px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 100,
        width: '380px',
        maxHeight: '80vh',
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px 8px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <span
          style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '3px',
            color: 'var(--accent-cyan)',
            textTransform: 'uppercase',
          }}
        >
          Writing Guide
        </span>
        <button
          onClick={onClose}
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '2px',
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '12px 16px 16px' }}>
        {/* Fountain Formatting */}
        <Section title="Fountain Format">
          <Tip prefix="." desc="Scene heading" example=".INT. WAREHOUSE - NIGHT" />
          <Tip prefix="@" desc="Character name" example="@mccoy" />
          <Tip prefix="!" desc="Action line" example="!He freezes." />
          <Tip prefix=">" desc="Transition" example=">SMASH CUT TO:" />
          <Tip prefix="> <" desc="Centered text" example=">THE END<" />
          <Tip prefix="()" desc="Parenthetical" example="(under his breath)" />
          <Tip prefix="~" desc="Lyrics" example="~Singing in the rain" />
          <Tip prefix="^" desc="Dual dialogue" example="CHARACTER ^" />
          <Tip prefix="===" desc="Page break" />
          <Tip prefix="[[note]]" desc="Script note" example="[[fix pacing here]]" />
          <Tip prefix="/* */" desc="Boneyard (hidden text)" example="/* cut scene */" />
        </Section>

        <Section title="Inline Styles">
          <Tip prefix="**text**" desc="Bold" />
          <Tip prefix="*text*" desc="Italic" />
          <Tip prefix="_text_" desc="Underline" />
          <Tip prefix="***text***" desc="Bold italic" />
        </Section>

        <Section title="Auto-Detection">
          <Desc text="Lines starting with INT. EXT. INT/EXT. or I/E. are automatically scene headings." />
          <Desc text="ALL CAPS lines (under 50 chars, after a blank line) become character names." />
          <Desc text="Text after a character name becomes dialogue." />
          <Desc text="Lines ending with TO: or starting with FADE/CUT become transitions." />
          <Desc text="Character names autocomplete as you type — arrow keys to cycle, Enter to accept." />
          <Desc text="Add ^ after a character name for dual (side-by-side) dialogue." />
        </Section>

        <Section title="Tab Cycling">
          <Shortcut keys="Tab" desc="Cycle: action → scene heading → character → dialogue → parenthetical → transition" />
          <Shortcut keys="Shift+Tab" desc="Reverse cycle" />
          <Desc text="Tab transforms the current line between all element types using Fountain prefixes. Case is never changed — character names, scene headings, and transitions display uppercase via CSS." />
        </Section>

        <Section title="Keyboard Shortcuts">
          <Shortcut keys="Enter" desc="Smart newline — single after character/parenthetical, double otherwise" />
          <Shortcut keys="Cmd+E" desc="Toggle Edit / Annotate mode" />
          <Shortcut keys="Cmd+Shift+F" desc="Toggle focus mode" />
          <Shortcut keys="Escape" desc="Exit focus mode" />
          <Shortcut keys="Cmd+=" desc="Zoom in" />
          <Shortcut keys="Cmd+-" desc="Zoom out" />
          <Shortcut keys="Cmd+0" desc="Reset zoom" />
          <Shortcut keys="Cmd+Z" desc="Undo" />
          <Shortcut keys="Cmd+Shift+Z" desc="Redo" />
          <Shortcut keys="Cmd+F" desc="Find in document" />
        </Section>

        <Section title="AI Rewrite">
          <Desc text="Switch to Annotate mode (Cmd+E), select text, and click 'Rewrite with AI' to get an AI-suggested rewrite of the selected passage." />
          <Desc text="The AI sees ~500 characters of surrounding context to maintain voice and continuity." />
          <Desc text="You can also manually annotate text with rewrite, delete, move, or flag actions for revision notes." />
        </Section>

        <Section title="Tips">
          <Desc text="In Annotate mode, select text to add script notes. Switch back to Edit mode to write." />
          <Desc text="Drag & drop .fountain, .fdx, .fadein, .highland, .wdz, or .celtx files to import." />
          <Desc text="Use the Save dropdown to export as Final Draft (.fdx)." />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</div>
    </div>
  )
}

function Tip({ prefix, desc, example }: { prefix: string; desc: string; example?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.5' }}>
      <code
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '11px',
          color: 'var(--accent-cyan)',
          background: 'var(--bg-primary)',
          padding: '1px 5px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {prefix}
      </code>
      <span style={{ color: 'var(--text-secondary)' }}>
        {desc}
        {example && (
          <span style={{ color: 'var(--text-dim)', marginLeft: '6px', fontSize: '10px' }}>{example}</span>
        )}
      </span>
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.5' }}>
      <kbd
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: 'var(--text-primary)',
          background: 'var(--bg-primary)',
          padding: '2px 6px',
          borderRadius: '3px',
          border: '1px solid var(--border-color)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
    </div>
  )
}

function Desc({ text }: { text: string }) {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: '10px', lineHeight: '1.5', paddingLeft: '2px' }}>
      {text}
    </div>
  )
}
