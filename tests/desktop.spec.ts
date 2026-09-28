import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { editorContent, launchThroughServices, persistedContent } from './launch-services'

const fixture = path.resolve('tests/fixtures/coil-parity.fountain')
const executablePath = path.resolve(`release/mac-${process.arch}/Coil.app/Contents/MacOS/Coil`)
const parity = path.resolve('verification/parity')
const viewport = { width: 1280, height: 800 }
async function launch(args: string[] = [], profile?: string) {
  const userData = profile ?? await mkdtemp(path.resolve('verification/runs/profile-'))
  const app = await electron.launch({ executablePath, env: { ...process.env, UPSTASH_REDIS_REST_URL: 'https://redis-must-not-be-contacted.invalid', UPSTASH_REDIS_REST_TOKEN: 'mock-redis-token' }, args: [`--user-data-dir=${userData}`, '--force-device-scale-factor=1', ...args] })
  app.process().stderr?.on('data', (data) => { const line = String(data); if (line.includes('Coil:')) console.log(line) })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.log('RENDERER ERROR', error.message))
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), viewport)
  await expect(page.getByText('COIL', { exact: true })).toBeVisible()
  // Fail closed: all main-process provider traffic is mocked, unexpected URLs throw.
  await app.evaluate(({ dialog }) => {
    dialog.showErrorBox = (_title, message) => { console.error('Coil:', message) }
    const calls: { url: string; body: Record<string, unknown>; key: string | null }[] = []
    Object.assign(globalThis, { providerCalls: calls })
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error(`Unexpected network request: ${url}`)
      const body = JSON.parse(String(init?.body))
      calls.push({ url, body, key: new Headers(init?.headers).get('x-api-key') })
      const text = body.system.includes('dialogue analyst')
        ? JSON.stringify({ schema_version: '1.0.0', characters: [{ name: 'MAYA', forbidden_patterns: [{ pattern: 'empty promises', evidence: 'Every frame remembers something we forgot.' }], vocabulary: [], syntax: [], rhythm: { length_bucket: 'moderate', patterns: [] }, rhetoric: [], profanity_register: 'none', formality_axis: 'neutral' }], convergence_warnings: [] })
        : JSON.stringify({ suggestions: [{ text: 'Every frame keeps a secret we left behind.', reasoning: 'More specific image' }, { text: 'The film remembers what we cannot.', reasoning: 'Shorter phrasing' }] })
      return Response.json({ content: [{ type: 'text', text }] })
    }
  })
  return { app, page, userData }
}
async function quit(app: ElectronApplication) {
  const child = app.process()
  const log = path.join(await mkdtemp(path.resolve('verification/runs/exec-quit-')), 'lifecycle.log')
  let closing: Promise<void> | undefined
  try {
    await app.evaluate(({ app }, logPath) => {
      const fs = process.getBuiltinModule('fs')
      app.once('before-quit', () => fs.appendFileSync(logPath, 'before-quit\n'))
      app.once('will-quit', () => fs.appendFileSync(logPath, 'will-quit\n'))
      app.once('quit', () => fs.appendFileSync(logPath, 'quit\n'))
    }, log)
    closing = app.close()
    await expect.poll(() => readFile(log, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return ''
      throw error
    }), { timeout: 10000 }).toBe('before-quit\nwill-quit\nquit\n')
    // Harness only: direct exec launches can stall after quit on this Mac
    // (https://github.com/electron/electron/issues/52582). Lifecycle/durability
    // acceptance uses LaunchServices below and never accepts a killed process.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await closing
    console.log('DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.')
  } finally {
    // Failed assertions stay failed; clean up only this test's direct-exec child.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await closing
  }
}
async function menu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(itemId)!
    item.click(undefined, undefined, undefined)
  }, id)
}
async function nativeOpen(app: ElectronApplication, file: string) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, file)
  await menu(app, 'open')
}
async function prepareScreenshot(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur() })
  await page.mouse.move(0, 0)
  await expect(page.locator('.cm-content')).toContainText('Every frame remembers')
  await page.waitForTimeout(300)
}

test('packaged app matches web pixels and executes native Open, Rewrite and Analyze', async ({ page: web }) => {
  const { app, page } = await launch()
  try {
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const prefs = (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean } }).getLastWebPreferences()
      return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration }
    })
    expect(preferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
    await nativeOpen(app, fixture)
    await expect(page.locator('.cm-content')).toContainText('Every frame remembers')
    await prepareScreenshot(page)
    await page.screenshot({ path: `${parity}/file-open.png`, scale: 'css', animations: 'disabled' })

    await web.goto('/')
    await web.getByRole('button', { name: 'Open', exact: true }).click({ trial: true })
    const chooser = web.waitForEvent('filechooser')
    await web.getByRole('button', { name: 'Open', exact: true }).click()
    await (await chooser).setFiles(fixture)
    await prepareScreenshot(web)
    await web.screenshot({ path: `${parity}/web.png`, scale: 'css', animations: 'disabled' })
    await page.screenshot({ path: `${parity}/mac.png`, scale: 'css', animations: 'disabled' })
    const mac = PNG.sync.read(await readFile(`${parity}/mac.png`))
    const browser = PNG.sync.read(await readFile(`${parity}/web.png`))
    expect([mac.width, mac.height]).toEqual([browser.width, browser.height])
    const diff = new PNG({ width: mac.width, height: mac.height })
    const pixels = pixelmatch(mac.data, browser.data, diff.data, mac.width, mac.height, { threshold: 0.1 })
    const ratio = pixels / (mac.width * mac.height)
    await writeFile(`${parity}/diff.png`, PNG.sync.write(diff))
    const result = { width: mac.width, height: mac.height, differentPixels: pixels, ratio, maximumRatio: 0.01, pixelmatchThreshold: 0.1 }
    await writeFile(`${parity}/result.json`, `${JSON.stringify(result, null, 2)}\n`)
    console.log('PARITY', JSON.stringify(result))
    expect(ratio).toBeLessThanOrEqual(0.01)

    await page.getByTitle('Settings', { exact: true }).click()
    await expect(page.getByRole('combobox').nth(0)).toHaveValue('anthropic')
    await expect(page.getByRole('combobox').nth(1)).toHaveValue('claude-fable-5-1')
    await page.getByPlaceholder('Enter anthropic API key').fill('mock-anthropic-key')
    await page.getByRole('button', { name: 'Close', exact: true }).first().click()
    await page.getByRole('button', { name: 'Analyze', exact: true }).click()
    await page.getByTitle('Analyze character voices').click()
    await expect(page.getByText('Voice: 1 character, 1 forbidden patterns')).toBeVisible()
    await page.screenshot({ path: `${parity}/analysis.png`, scale: 'css' })

    // Real editor selection/mouseup path opens the existing rewrite popup.
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+Home')
    await page.keyboard.press('Meta+A')
    await page.locator('.cm-content').dispatchEvent('mouseup')
    await expect(page.getByText('Every frame keeps a secret we left behind.', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${parity}/rewrite.png`, scale: 'css' })
    const calls = await app.evaluate(() => (globalThis as unknown as { providerCalls: unknown[] }).providerCalls)
    expect(calls).toHaveLength(2)
    for (const call of calls as { body: { model: string }; key: string }[]) {
      expect(call.body.model).toBe('claude-fable-5-1')
      expect(call.key).toBe('mock-anthropic-key')
    }
    console.log('AI: Rewrite and Analyze reached the shared local handlers; both requested claude-fable-5-1 with the Settings key.')
    await page.keyboard.press('Escape')
  } finally { await quit(app) }
})

test('OS file events, cold opens, Save/Save As/Export and window state work', async () => {
  const run = await mkdtemp(path.resolve('verification/runs/documents-'))
  const opened = path.join(run, 'original.fountain')
  await writeFile(opened, await readFile(fixture))
  const { app, page, userData } = await launch([opened])
  try {
    await expect(page.locator('.cm-content')).toContainText('Every frame remembers')
    const second = path.join(run, 'second.fountain')
    await writeFile(second, 'INT. STATION - DAY\n\nThe clock has stopped.\n')
    await app.evaluate(({ app }, file) => { app.emit('open-file', { preventDefault() {} }, file) }, second)
    await expect(page.locator('.cm-content')).toContainText('The clock has stopped.')
    await nativeOpen(app, opened)
    await expect(page.locator('.cm-content')).toContainText('Every frame remembers')

    // Opening different content under the same basename, including an empty file, must reload CM6.
    await writeFile(opened, 'INT. SAME NAME - DAY\n\nA new draft.\n')
    await nativeOpen(app, opened)
    await expect(page.locator('.cm-content')).toContainText('A new draft.')
    await writeFile(opened, '')
    await nativeOpen(app, opened)
    await expect(page.locator('.cm-content')).toHaveText('')
    await writeFile(opened, await readFile(fixture))
    await nativeOpen(app, opened)
    await expect(page.locator('.cm-content')).toContainText('Every frame remembers')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await page.keyboard.type('\nTHE END\n')
    await menu(app, 'save')
    await expect.poll(() => readFile(opened, 'utf8')).toContain('THE END')
    const saved = path.join(run, 'saved.fountain')
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }) }, saved)
    await menu(app, 'saveAs')
    await expect.poll(() => readFile(saved, 'utf8').catch((error) => { if (error.code === 'ENOENT') return ''; throw error })).toContain('THE END')
    const exported = path.join(run, 'export.fdx')
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }) }, exported)
    await menu(app, 'exportFDX')
    await expect.poll(() => readFile(exported, 'utf8').catch((error) => { if (error.code === 'ENOENT') return ''; throw error })).toContain('<FinalDraft')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 50, y: 70, width: 1100, height: 760 }))
    await page.waitForTimeout(1000)
  } finally { await quit(app) }
  const savedBounds = JSON.parse(await readFile(path.join(userData, 'window.json'), 'utf8'))
  expect(savedBounds).toMatchObject({ width: 1100, height: 760 })
  const relaunched = await electron.launch({ executablePath, args: [`--user-data-dir=${userData}`] })
  try {
    await relaunched.firstWindow()
    expect(await relaunched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toMatchObject({ width: 1100, height: 760 })
  } finally { await quit(relaunched) }
  console.log('NATIVE: cold file argument, open-file event, File > Open/Save/Save As/Export, and remembered window bounds passed.')
})

test('desktop refuses remote content, opens external links in the browser and migrates stale models without losing keys', async () => {
  const { app, page } = await launch()
  try {
    await app.evaluate(({ shell }) => {
      Object.assign(globalThis, { externalUrls: [] })
      shell.openExternal = async (url) => { (globalThis as unknown as { externalUrls: string[] }).externalUrls.push(url) }
    })
    await page.evaluate(() => window.open('https://example.com/coil-help', '_blank'))
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { externalUrls: string[] }).externalUrls)).toEqual(['https://example.com/coil-help'])
    expect(await page.evaluate(() => fetch('/api/unknown').then((response) => response.status))).toBe(404)
    expect(await page.evaluate(() => fetch('/%2e%2e%2fpackage.json').then((response) => response.status))).toBe(403)
    expect(await page.evaluate(() => fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ scriptContent: 'INT. ROOM - DAY' }) }).then((response) => response.status))).toBe(400)
    expect(await page.evaluate(() => fetch('https://example.com').then(() => 'loaded', () => 'blocked'))).toBe('blocked')
    expect(await app.evaluate(() => (globalThis as unknown as { providerCalls: unknown[] }).providerCalls)).toHaveLength(0)
    const rateLimit = await page.evaluate(async () => {
      const response = await fetch('/api/rewrite', { method: 'POST', body: JSON.stringify({ provider: 'anthropic', model: 'claude-fable-5-1', selectedText: 'Every frame remembers something.' }) })
      return { status: response.status, remaining: response.headers.get('X-Usage-Remaining') }
    })
    expect(rateLimit).toEqual({ status: 500, remaining: '999' })

    await page.evaluate(() => localStorage.setItem('recoil-fountain-ai', JSON.stringify({ version: 0, state: {
      provider: 'google', model: 'gemini-2.5-pro', comparisonProviderA: 'google', comparisonModelA: 'gemini-2.5-pro', comparisonProviderB: 'anthropic', comparisonModelB: 'claude-sonnet-4-20250514',
      apiKeys: { anthropic: 'retained-anthropic-key', openai: 'retained-openai-key', google: '' },
    } })))
    await page.reload()
    await page.getByTitle('Settings', { exact: true }).click()
    await expect(page.getByRole('combobox').nth(0)).toHaveValue('anthropic')
    await expect(page.getByRole('combobox').nth(1)).toHaveValue('claude-fable-5-1')
    await expect(page.getByPlaceholder('Enter anthropic API key')).toHaveValue('retained-anthropic-key')
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('combobox').nth(2)).toHaveValue('anthropic:claude-fable-5-1')
    await expect(page.getByRole('combobox').nth(3)).toHaveValue('openai:gpt-6-astra')
    console.log('SECURITY: sandbox, local-only requests, external-link delegation, missing-key refusal, traversal refusal, and persisted-key migration passed.')
  } finally { await quit(app) }
})


test('File > Open recreates the editor after closing the last window', async () => {
  const { app, page } = await launch()
  try {
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }) })
    const closed = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await closed
    const nextWindow = app.waitForEvent('window')
    await nativeOpen(app, fixture)
    const nextPage = await nextWindow
    await expect(nextPage.locator('.cm-content')).toContainText('Every frame remembers')
    console.log('NATIVE: File > Open recreates the closed window and loads the script.')
  } finally { await quit(app) }
})

test('LaunchServices preserves normal autosaves and window bounds across five quit/relaunch cycles', async () => {
  const profile = await mkdtemp(path.resolve('verification/runs/durability-'))
  let running: Awaited<ReturnType<typeof launchThroughServices>> | undefined
  try {
    running = await launchThroughServices(profile, fixture)
    await expect(running.page.locator('.cm-content')).toContainText('Every frame remembers')
    const markers: string[] = []
    for (let cycle = 1; cycle <= 5; cycle++) {
      const marker = `Durability marker ${path.basename(profile)} cycle ${cycle}.`
      markers.push(marker)
      await running.page.locator('.cm-content').click()
      await running.page.keyboard.press('Meta+End')
      await running.page.keyboard.type(`\n${marker}\n`)
      const expected = await editorContent(running.page)
      for (const previous of markers) expect(expected).toContain(previous)
      // Observe the normal two-second Dexie autosave; never write the DB from tests.
      await expect.poll(() => persistedContent(running!.page), { timeout: 10000 }).toBe(expected)
      const bounds = { x: 60 + cycle * 10, y: 80 + cycle * 10, width: 1050 + cycle * 10, height: 730 + cycle * 10 }
      await running.evaluate(`require('electron').BrowserWindow.getAllWindows()[0].setBounds(${JSON.stringify(bounds)})`)
      await expect.poll(() => running!.evaluate("require('electron').BrowserWindow.getAllWindows()[0].getBounds()")).toEqual(bounds)
      const quitting = running
      running = undefined
      await quitting.quit()
      expect(JSON.parse(await readFile(path.join(profile, 'window.json'), 'utf8'))).toMatchObject(bounds)
      running = await launchThroughServices(profile)
      await expect(running.page.locator('.cm-content')).toBeVisible()
      await running.page.locator('.cm-content').click()
      await running.page.keyboard.press('Meta+End')
      await expect(running.page.locator('.cm-content')).toContainText(marker)
      expect(await editorContent(running.page)).toBe(expected)
      expect(await persistedContent(running.page)).toBe(expected)
      expect(await running.evaluate("require('electron').BrowserWindow.getAllWindows()[0].getBounds()")).toEqual(bounds)
      console.log(`DURABILITY ${cycle}/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=${marker}`)
    }
  } finally { if (running) await running.quit() }
})
