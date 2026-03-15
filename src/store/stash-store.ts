import { create } from 'zustand'

export interface StashEntry {
  id: string
  text: string
  source: 'cut' | 'deleted'
  sceneHeading: string
  timestamp: string
  characters: string[]
}

interface StashState {
  entries: StashEntry[]
  isOpen: boolean
  searchQuery: string

  addEntry: (text: string, source: 'cut' | 'deleted', sceneHeading: string, characters: string[]) => void
  removeEntry: (id: string) => void
  toggleOpen: () => void
  setSearchQuery: (query: string) => void
  clear: () => void
}

export const useStashStore = create<StashState>((set) => ({
  entries: [],
  isOpen: false,
  searchQuery: '',

  addEntry: (text, source, sceneHeading, characters) =>
    set((s) => ({
      entries: [
        {
          id: `stash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text,
          source,
          sceneHeading,
          timestamp: new Date().toISOString(),
          characters,
        },
        ...s.entries,
      ].slice(0, 100), // max 100 entries
    })),

  removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clear: () => set({ entries: [] }),
}))
