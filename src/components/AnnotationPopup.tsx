import { MessageSquarePlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createNote, currentAuthor } from '../lib/notes'
import { useAIStore } from '../store/ai-store'
import { useAnnotationStore } from '../store/annotation-store'
import { useEditorStore } from '../store/editor-store'

/**
 * Note creation. A small "Note" button floats next to a non-empty selection (after mouseup / keyboard selection);
 * Cmd/Ctrl+Shift+M (see EditorPanel) or the button opens the inline composer at the selection.
 * Enter saves, Shift+Enter inserts a newline, Esc cancels.
 */

const BUTTON_W = 64
const COMPOSER_W = 288

interface Anchor {
  x: number
  y: number
}

function anchorFor(view: import('@codemirror/view').EditorView, pos: number): Anchor | null {
  const c = view.coordsAtPos(pos, -1) ?? view.coordsAtPos(pos)
  return c ? { x: c.right, y: c.bottom } : null
}

export function AnnotationPopup() {
  const viewRef = useEditorStore((s) => s.viewRef)
  const composer = useAnnotationStore((s) => s.composer)
  const [button, setButton] = useState<Anchor | null>(null)
  const [text, setText] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // Cmd/Ctrl-release is the Analyze rewrite gesture: no note button until the next click or key
  const rewriteGesture = useRef(false)
  const composerOpen = composer !== null

  const evaluate = useCallback(() => {
    const view = viewRef?.current
    if (!view || dragging.current || rewriteGesture.current || useAnnotationStore.getState().composer)
      return setButton(null)
    if (useAIStore.getState().rewriteSelection) return setButton(null)
    const sel = view.state.selection.main
    if (sel.from === sel.to) return setButton(null)
    // Clicking a note jumps to + selects its passage: that is not a request for a new note
    if (useAnnotationStore.getState().annotations.some((a) => a.from === sel.from && a.to === sel.to))
      return setButton(null)
    setButton(anchorFor(view, sel.to))
  }, [viewRef])

  // Show / hide the floating button as the selection changes
  useEffect(() => {
    const view = viewRef?.current
    if (!view) return
    const onDown = () => {
      rewriteGesture.current = false
      dragging.current = true
      setButton(null)
    }
    const onUp = (e: MouseEvent) => {
      if (!dragging.current) return
      dragging.current = false
      // Cmd/Ctrl-release is the Analyze rewrite gesture — not a note gesture
      if (e.metaKey || e.ctrlKey) {
        rewriteGesture.current = true
        return setButton(null)
      }
      requestAnimationFrame(evaluate)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'Escape') {
        rewriteGesture.current = false
        requestAnimationFrame(evaluate)
      }
    }
    const onSelectionChange = () => {
      if (!dragging.current) requestAnimationFrame(evaluate)
    }
    view.dom.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    view.dom.addEventListener('keyup', onKeyUp)
    view.scrollDOM.addEventListener('scroll', evaluate, { passive: true })
    document.addEventListener('selectionchange', onSelectionChange)
    // Panels opening/closing move the text: keep the button on the selection
    const ro = new ResizeObserver(() => evaluate())
    ro.observe(view.dom)
    return () => {
      ro.disconnect()
      view.dom.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      view.dom.removeEventListener('keyup', onKeyUp)
      view.scrollDOM.removeEventListener('scroll', evaluate)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [viewRef, evaluate])

  // The composer renders in the same pass that opens it (so the first keystrokes after the shortcut land in it)
  const composerPos = useMemo(() => {
    const view = viewRef?.current
    return composer && view ? anchorFor(view, composer.to) : null
  }, [composer, viewRef])
  useEffect(() => {
    if (!composer) return
    setButton(null)
  }, [composer])

  const close = useCallback(() => {
    setText('')
    useAnnotationStore.getState().setComposer(null)
    viewRef?.current?.focus()
  }, [viewRef])

  const save = useCallback(() => {
    const view = viewRef?.current
    const c = useAnnotationStore.getState().composer
    if (!view || !c) return
    const note = createNote(view, c.from, c.to, text)
    if (!note) return
    setText('')
    useAnnotationStore.getState().setComposer(null)
    useAnnotationStore.getState().setSelectedId(note.id)
    view.dispatch({ selection: { anchor: c.to } })
    view.focus()
  }, [viewRef, text])

  const openFromSelection = useCallback(() => {
    const view = viewRef?.current
    if (!view) return
    const sel = view.state.selection.main
    if (sel.from === sel.to) return
    useAnnotationStore.getState().setComposer({
      from: sel.from,
      to: sel.to,
      text: view.state.doc.sliceString(sel.from, sel.to),
    })
  }, [viewRef])

  // Cmd/Ctrl+Shift+M — no CodeMirror binding uses it (the default keymap has Ctrl-m / Shift-Alt-m only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'm') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
      e.preventDefault()
      openFromSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFromSelection])

  // Click outside the composer cancels it
  useEffect(() => {
    if (!composerOpen) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [composerOpen, close])

  const clampX = (x: number, w: number) => Math.max(8, Math.min(x, window.innerWidth - w - 8))

  if (composer && composerPos) {
    const quote = composer.text.length > 80 ? `${composer.text.slice(0, 80)}…` : composer.text
    const below = composerPos.y + 8
    const top = below + 150 > window.innerHeight ? Math.max(8, composerPos.y - 158) : below
    return (
      <div
        ref={boxRef}
        data-note-composer
        style={{
          position: 'fixed',
          left: clampX(composerPos.x - COMPOSER_W / 2, COMPOSER_W),
          top,
          width: COMPOSER_W,
          zIndex: 45,
          padding: '10px 12px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--accent-cyan)',
          borderRadius: 'var(--card-radius)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--text-muted)',
            marginBottom: '6px',
          }}
        >
          <span>Note</span>
          <span style={{ fontWeight: 500, letterSpacing: '0.05em' }}>{currentAuthor()}</span>
        </div>
        <div
          style={{
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-dim)',
            marginBottom: '6px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          “{quote.replace(/\s+/g, ' ')}”
        </div>
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the composer exists to be typed into the moment it opens
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              save()
            }
          }}
          rows={3}
          placeholder="Type a note"
          style={{
            width: '100%',
            resize: 'none',
            fontSize: '12px',
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.5,
            padding: '6px 8px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--btn-radius)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-dim)',
          }}
        >
          Enter saves · Shift+Enter newline · Esc cancels
        </div>
      </div>
    )
  }

  if (!button) return null
  return (
    <button
      type="button"
      // Keep the editor selection: the button must not take focus
      onMouseDown={(e) => e.preventDefault()}
      onClick={openFromSelection}
      title="Add a note to the selection (Cmd/Ctrl+Shift+M)"
      style={{
        position: 'fixed',
        left: clampX(button.x + 8, BUTTON_W),
        top: button.y + 4,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', 'Inter', sans-serif",
        background: 'var(--accent-cyan-dim)',
        border: '1px solid var(--accent-cyan)',
        borderRadius: '5px',
        color: 'var(--accent-cyan)',
        cursor: 'pointer',
      }}
    >
      <MessageSquarePlus size={12} />
      Note
    </button>
  )
}
