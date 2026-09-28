import { chromium, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const bundle = path.resolve(`release/mac-${process.arch}/Coil.app`)
const binary = `${bundle}/Contents/MacOS/Coil`

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function matchingProcesses(profile?: string) {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,command='])
  return stdout.split('\n').filter((line) => {
    const command = line.trim().replace(/^\d+\s+/, '')
    return (command === binary || command.startsWith(`${binary} `)) && (!profile || command.split(' ').includes(`--user-data-dir=${profile}`))
  }).map((line) => Number(line.trim().split(/\s+/)[0]))
}

async function cleanFailedLaunch(profile: string) {
  // Failure cleanup only, never an accepted lifecycle exit. The unique profile
  // and exact bundle path constrain this to processes launched by this test.
  for (const pid of await matchingProcesses(profile)) {
    try { process.kill(pid, 'SIGKILL') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
}

// Connect only for individual main-process observations, then disconnect before
// Quit. No loader, test IPC, shutdown workaround, or hook ships in the .app.
async function evaluate(port: number, expression: string): Promise<unknown> {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Main-process inspector timed out')), 5000)
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Main-process inspector connection failed')) })
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression, includeCommandLineAPI: true, returnByValue: true, awaitPromise: true,
      } })))
      socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(String(data))
        if (message.id !== 1) return
        clearTimeout(timer)
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)))
        else resolve(message.result.result.value)
      })
    })
  } finally {
    if (socket.readyState !== WebSocket.CLOSED) {
      const closed = new Promise<void>((resolve) => socket.addEventListener('close', () => resolve(), { once: true }))
      socket.close()
      await closed
    }
  }
}

export async function launchThroughServices(profile: string, document?: string) {
  // AppleScript addresses a bundle. Refuse ambiguity instead of quitting an
  // unrelated instance; repeat this check immediately before sending Quit.
  expect(await matchingProcesses()).toEqual([])
  const [inspectPort, browserPort] = await Promise.all([availablePort(), availablePort()])
  const log = path.join(await mkdtemp(path.resolve('verification/runs/services-quit-')), 'lifecycle.log')
  let browser: Browser | undefined
  try {
    await exec('/usr/bin/open', ['-n', '-a', bundle, ...(document ? [document] : []), '--args', `--user-data-dir=${profile}`,
      `--inspect=127.0.0.1:${inspectPort}`, `--remote-debugging-port=${browserPort}`, '--force-color-profile=srgb'])
    await expect.poll(() => matchingProcesses(profile), { timeout: 10000 }).toHaveLength(1)
    const [pid] = await matchingProcesses(profile)
    for (const port of [inspectPort, browserPort]) {
      await expect.poll(() => fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.ok, () => false), { timeout: 10000 }).toBe(true)
    }
    await evaluate(inspectPort, `(() => {
      const { app } = require('electron');
      const fs = require('node:fs');
      for (const event of ['before-quit', 'will-quit', 'quit'])
        app.once(event, () => fs.appendFileSync(${JSON.stringify(log)}, event + '\\n'));
      globalThis.fetch = async () => { throw new Error('Provider calls forbidden in durability test'); };
    })()`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`)
    const context = browser.contexts()[0]
    await expect.poll(() => context.pages().length).toBeGreaterThan(0)
    const page = context.pages()[0]
    await expect(page.getByText('COIL', { exact: true })).toBeVisible()
    return {
      page,
      evaluate: (expression: string) => evaluate(inspectPort, expression),
      async secondInstance(document: string) {
        await evaluate(inspectPort, `globalThis.secondInstances = 0; require('electron').app.once('second-instance', () => globalThis.secondInstances++)`)
        try {
          await exec('/usr/bin/open', ['-n', '-a', bundle, '--args', `--user-data-dir=${profile}`, document])
          await expect.poll(() => evaluate(inspectPort, 'globalThis.secondInstances'), { timeout: 10000 }).toBe(1)
          await expect.poll(() => matchingProcesses(profile), { timeout: 10000 }).toEqual([pid])
        } finally {
          // Preserve a failure while cleaning only any extra process we launched.
          for (const extra of await matchingProcesses(profile)) if (extra !== pid) process.kill(extra, 'SIGKILL')
        }
      },
      async quit() {
        try {
          expect(await matchingProcesses()).toEqual([pid])
          // connectOverCDP.close disconnects this client; it does not kill the app.
          await browser!.close()
          const start = Date.now()
          await exec('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', bundle], { timeout: 10000 })
          await expect.poll(() => matchingProcesses(profile), { timeout: Math.max(1, 10000 - (Date.now() - start)), intervals: [100, 200, 500] }).toEqual([])
          expect(Date.now() - start).toBeLessThan(10000)
          expect(await readFile(log, 'utf8')).toBe('before-quit\nwill-quit\nquit\n')
          console.log(`LAUNCHSERVICES: pid=${pid}; before-quit > will-quit > quit; process gone in ${Date.now() - start}ms; no forced exit.`)
        } catch (error) {
          await cleanFailedLaunch(profile)
          throw error
        }
      },
    }
  } catch (error) {
    await browser?.close()
    await cleanFailedLaunch(profile)
    throw error
  }
}

export async function editorContent(page: Page): Promise<string> {
  // Read the same view used by EditorView.findFromDOM in the installed
  // @codemirror/view. DOM text alone excludes virtualized offscreen lines.
  return page.locator('.cm-content').evaluate((element) => {
    const content = element as HTMLElement & { cmTile: { root: { view: { state: { doc: { toString(): string } } } } } }
    return content.cmTile.root.view.state.doc.toString()
  })
}

export async function persistedContent(page: Page): Promise<string | null> {
  return page.evaluate(() => new Promise<string | null>((resolve, reject) => {
    const request = indexedDB.open('RecoilFountainEditor')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('documents', 'readonly')
      const read = transaction.objectStore('documents').getAll()
      transaction.oncomplete = () => {
        const records = read.result as { content: string; lastModified: number }[]
        records.sort((a, b) => b.lastModified - a.lastModified)
        db.close()
        resolve(records[0]?.content ?? null)
      }
      transaction.onerror = () => { db.close(); reject(transaction.error) }
    }
  }))
}
