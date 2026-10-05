import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CustomSlots,
  EMPTY_SLOTS,
  contrastRatio,
  cycleOrder,
  deriveCustomPreset,
  hexToHsl,
  hslToHex,
  nextThemeId,
  nudgeForContrast,
} from '../src/themes/custom-colors'
import { PRESETS } from '../src/themes/presets'

const slot = (name: string) => ({ name, bg: '#10203a', text: '#f3e9d2', accent: '#ffb347' })

describe('color math', () => {
  it('contrast ratio matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('#123456', '#123456')).toBe(1)
  })
  it('hsl round-trips', () => {
    for (const hex of ['#10203a', '#f3e9d2', '#ffb347', '#00f0ff']) {
      const [h, s, l] = hexToHsl(hex)
      expect(hslToHex(h, s, l)).toBe(hex)
    }
  })
  it('nudgeForContrast reaches the target keeping hue, and leaves good colors alone', () => {
    expect(nudgeForContrast('#f3e9d2', '#10203a', 4.5)).toBe('#f3e9d2')
    const fixed = nudgeForContrast('#2a3a5a', '#10203a', 4.5)
    expect(contrastRatio(fixed, '#10203a')).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(hexToHsl(fixed)[0] - hexToHsl('#2a3a5a')[0])).toBeLessThan(5)
  })
})

describe('derivation', () => {
  const c = { bg: '#10203a', text: '#f3e9d2', accent: '#ffb347' }
  const d = deriveCustomPreset(c)
  it('keeps every variable name of a built-in preset and applies the three picks', () => {
    expect(Object.keys(d.vars).sort()).toEqual(Object.keys(PRESETS.recoil.vars).sort())
    expect(d.vars['--bg-primary']).toBe(c.bg)
    expect(d.vars['--text-primary']).toBe(c.text)
    expect(d.vars['--accent-cyan']).toBe(c.accent)
    expect(d.vars['--accent-cyan-dim']).toBe('rgba(255, 179, 71, 0.1)')
    expect(d.isDark).toBe(true)
  })
  it('keeps text hierarchy readable and ordered', () => {
    const r = (k: string) => contrastRatio(d.vars[k], c.bg)
    expect(r('--text-primary')).toBeGreaterThan(r('--text-secondary'))
    expect(r('--text-secondary')).toBeGreaterThan(r('--text-muted'))
    expect(r('--text-muted')).toBeGreaterThan(r('--text-dim'))
    expect(r('--color-scene-heading')).toBeGreaterThanOrEqual(4.5)
    expect(d.vars['--color-dialogue']).toBe(c.text)
  })
  it('light backgrounds derive a light theme with plain-text script colors', () => {
    const l = deriveCustomPreset({ bg: '#f5efe0', text: '#1c1c28', accent: '#1d5fa8' })
    expect(l.isDark).toBe(false)
    expect(l.vars['--color-scene-heading']).toBe('#1c1c28')
    expect(Object.keys(l.vars).sort()).toEqual(Object.keys(PRESETS.light.vars).sort())
  })
})

describe('cycle order', () => {
  it('Dark → Muted → Light with no slots, wrapping', () => {
    expect(cycleOrder(EMPTY_SLOTS)).toEqual(['recoil', 'muted', 'light'])
    expect(nextThemeId('light', EMPTY_SLOTS)).toBe('recoil')
  })
  it('includes filled slots and skips empty ones', () => {
    const only2: CustomSlots = { custom1: null, custom2: slot('Custom 2') }
    expect(nextThemeId('light', only2)).toBe('custom2')
    expect(nextThemeId('custom2', only2)).toBe('recoil')
    const both: CustomSlots = { custom1: slot('Custom 1'), custom2: slot('Custom 2') }
    expect(cycleOrder(both)).toEqual(['recoil', 'muted', 'light', 'custom1', 'custom2'])
    expect(nextThemeId('custom1', both)).toBe('custom2')
  })
  it('a draft or stale id restarts at Dark', () => {
    expect(nextThemeId('draft', EMPTY_SLOTS)).toBe('recoil')
    expect(nextThemeId('custom1', EMPTY_SLOTS)).toBe('recoil')
  })
})

describe('settings store: slots + migration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })
  function stubDom(initial?: Record<string, string>) {
    const data: Record<string, string> = { ...initial }
    const ls = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v
      },
      removeItem: (k: string) => {
        delete data[k]
      },
    }
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('window', { localStorage: ls })
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: () => {} } },
      body: { className: '', style: {} },
    })
    return data
  }

  it('saves a slot, persists it, and restores it in a fresh load', async () => {
    const data = stubDom()
    const { useSettingsStore } = await import('../src/store/settings-store')
    const st = useSettingsStore.getState()
    st.setCustomColor('bg', '#10203a')
    st.setCustomColor('text', '#f3e9d2')
    st.setCustomColor('accent', '#ffb347')
    expect(useSettingsStore.getState().preset).toBe('draft')
    expect(useSettingsStore.getState().saveCustomSlot('custom1')).toBe(true)
    expect(useSettingsStore.getState().preset).toBe('custom1')
    expect(useSettingsStore.getState().customSlots.custom1).toMatchObject({ bg: '#10203a', text: '#f3e9d2' })

    const saved = JSON.parse(data['coil-settings-v3'])
    expect(saved.version).toBe(3)
    expect(saved.state.customSlots.custom1.accent).toBe('#ffb347')

    vi.resetModules()
    const again = await import('../src/store/settings-store')
    expect(again.useSettingsStore.getState().preset).toBe('custom1')
    expect(again.useSettingsStore.getState().customSlots.custom1?.name).toBe('Custom 1')
  })

  it('refuses to save below 3:1 contrast', async () => {
    stubDom()
    const { useSettingsStore } = await import('../src/store/settings-store')
    const st = useSettingsStore.getState()
    st.setCustomColor('bg', '#202020')
    st.setCustomColor('text', '#262626')
    expect(useSettingsStore.getState().saveCustomSlot('custom2')).toBe(false)
    expect(useSettingsStore.getState().customSlots.custom2).toBeNull()
  })

  it('migrates a v2 store keeping every existing field including leftPanelWidth', async () => {
    stubDom({
      'coil-settings-v3': JSON.stringify({
        version: 2,
        state: {
          preset: 'muted',
          theme: 'dark',
          fontSize: 19,
          zoomLevel: 140,
          leftPanelWidth: 260,
          editorMode: 'analyze',
        },
      }),
    })
    const { useSettingsStore } = await import('../src/store/settings-store')
    const s = useSettingsStore.getState()
    expect(s.leftPanelWidth).toBe(260)
    expect(s.fontSize).toBe(19)
    expect(s.zoomLevel).toBe(140)
    expect(s.preset).toBe('muted')
    expect(s.editorMode).toBe('analyze')
    expect(s.customSlots).toEqual({ custom1: null, custom2: null })
  })

  it('toolbar cycle reaches a saved slot and skips the empty one', async () => {
    stubDom()
    const { useSettingsStore } = await import('../src/store/settings-store')
    const st = useSettingsStore.getState()
    st.setCustomColor('text', '#ffffff')
    st.saveCustomSlot('custom2')
    const seen: string[] = [useSettingsStore.getState().preset]
    for (let i = 0; i < 4; i++) {
      useSettingsStore.getState().toggleTheme()
      seen.push(useSettingsStore.getState().preset)
    }
    expect(seen).toEqual(['custom2', 'recoil', 'muted', 'light', 'custom2'])
  })
})

describe('rehydrate guard (Astra)', () => {
  it('an unreadable unsaved draft is not restored on launch', async () => {
    const data: Record<string, string> = {
      'coil-settings-v3': JSON.stringify({
        version: 3,
        state: {
          preset: 'draft',
          draftBase: 'muted',
          customDraft: { bg: '#0a0a0f', text: '#0a0a0f', accent: '#00f0ff' },
        },
      }),
    }
    const ls = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v
      },
      removeItem: (k: string) => {
        delete data[k]
      },
    }
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('window', { localStorage: ls })
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: () => {} } },
      body: { className: '', style: {} },
    })
    vi.resetModules()
    const { useSettingsStore } = await import('../src/store/settings-store')
    expect(useSettingsStore.getState().preset).toBe('muted')
  })
})
