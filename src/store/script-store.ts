/**
 * Script Store — caches the parsed SceneBlock AST.
 *
 * Debounced update: re-parses 300ms after content stops changing.
 * Keyed by content hash to avoid redundant parsing.
 */

import { create } from 'zustand'
import type { SceneBlock } from '../lib/scene-model'
import { parseSceneBlocks } from '../lib/scene-model'

interface ScriptState {
  /** Parsed scene blocks for the current document */
  scenes: SceneBlock[]
  /** Hash of content that produced current scenes (simple length+checksum) */
  contentKey: string | null
  /** Whether a parse is currently debounce-pending */
  parsing: boolean

  /** Called by EditorPanel on content change (debounced externally) */
  updateFromContent: (content: string) => void
  /** Force immediate re-parse */
  forceUpdate: (content: string) => void
  /** Clear state (file closed) */
  clear: () => void
}

/** Simple fast hash — not cryptographic, just for cache invalidation */
function quickHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return `${s.length}_${h}`
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export const useScriptStore = create<ScriptState>((set, get) => ({
  scenes: [],
  contentKey: null,
  parsing: false,

  updateFromContent: (content: string) => {
    const key = quickHash(content)
    if (key === get().contentKey) return

    set({ parsing: true })

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const scenes = parseSceneBlocks(content)
      set({ scenes, contentKey: key, parsing: false })
    }, 300)
  },

  forceUpdate: (content: string) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    const key = quickHash(content)
    const scenes = parseSceneBlocks(content)
    set({ scenes, contentKey: key, parsing: false })
  },

  clear: () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    set({ scenes: [], contentKey: null, parsing: false })
  },
}))
