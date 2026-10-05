import { expect, test, vi } from 'vitest'

// zustand `persist` needs a localStorage; give node one so "author persisted" is observable.
const storage = vi.hoisted(() => {
  const map = new Map<string, string>()
  // zustand reads window.localStorage
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    },
  })
  return map
})
vi.stubGlobal('document', {
  documentElement: { style: { setProperty: () => {} } },
  body: { className: '', style: {} },
})

test('the author name defaults to Me and is persisted', async () => {
  const { useSettingsStore } = await import('../src/store/settings-store')
  expect(useSettingsStore.getState().authorName).toBe('Me')
  useSettingsStore.getState().setAuthorName('Jason')
  expect(storage.get('coil-settings-v3')).toContain('"authorName":"Jason"')
})
