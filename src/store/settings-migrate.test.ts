import { afterEach, describe, expect, it, vi } from 'vitest'

const v3 = {
  fontSize: 18,
  customSlots: { custom1: null, custom2: null },
  customDraft: null,
  draftBase: 'muted',
  preset: 'muted',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function load() {
  vi.stubGlobal('document', {
    documentElement: { style: { setProperty: () => {} } },
    body: { className: '', style: {} },
  })
  return import('./settings-store')
}

describe('settings migrate to v4 (leftPanelWidth null = auto)', () => {
  it('keeps a user-dragged width and every other field', async () => {
    const { migrateSettings } = await load()
    expect(migrateSettings({ ...v3, leftPanelWidth: 320 }, 3)).toEqual({ ...v3, leftPanelWidth: 320 })
  })
  it('maps the old default (never dragged) to auto', async () => {
    const { migrateSettings } = await load()
    expect(migrateSettings({ ...v3, leftPanelWidth: 180 }, 3)).toEqual({ ...v3, leftPanelWidth: null })
  })
  it('chains from v2 keeping the width and adding custom slots', async () => {
    const { migrateSettings } = await load()
    const out = migrateSettings({ leftPanelWidth: 300, fontSize: 16 }, 2) as Record<string, unknown>
    expect(out.leftPanelWidth).toBe(300)
    expect(out.customSlots).toEqual({ custom1: null, custom2: null })
  })
  it('defaults a missing width to auto and leaves v4 state alone', async () => {
    const { migrateSettings } = await load()
    expect((migrateSettings({ fontSize: 16 }, 3) as Record<string, unknown>).leftPanelWidth).toBeNull()
    expect(migrateSettings({ leftPanelWidth: null }, 4)).toEqual({ leftPanelWidth: null })
  })
  it('setLeftPanelWidth(null) means auto; numbers are clamped', async () => {
    const data: Record<string, string> = {}
    const ls = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v
      },
      removeItem: () => {},
    }
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('window', { localStorage: ls })
    const { useSettingsStore } = await load()
    expect(useSettingsStore.getState().leftPanelWidth).toBeNull()
    useSettingsStore.getState().setLeftPanelWidth(9999)
    expect(useSettingsStore.getState().leftPanelWidth).toBe(480)
    useSettingsStore.getState().setLeftPanelWidth(null)
    expect(useSettingsStore.getState().leftPanelWidth).toBeNull()
  })
})
