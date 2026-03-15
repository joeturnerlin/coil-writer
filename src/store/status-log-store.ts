/**
 * Status Log Store — console-like log for the Analyze panel.
 * Tracks voice analysis, subtext checks, continuity checks, and errors.
 */

import { create } from 'zustand'

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'progress'

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  message: string
}

let nextId = 1

interface StatusLogState {
  entries: LogEntry[]
  log: (level: LogLevel, message: string) => void
  clear: () => void
}

function timeString(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

export const useStatusLog = create<StatusLogState>((set) => ({
  entries: [],

  log: (level, message) =>
    set((s) => ({
      entries: [...s.entries.slice(-100), { id: nextId++, time: timeString(), level, message }],
    })),

  clear: () => set({ entries: [] }),
}))
