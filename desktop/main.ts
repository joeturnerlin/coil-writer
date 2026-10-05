import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import rewrite from '../api/rewrite'
import { handleAnalysis } from '../api/analyze'
import subtext from '../api/subtext'
import structure from '../api/structure'
import continuity from '../api/continuity'
import { handleProofread as proofread } from '../api/proofread'
import { routeApi } from './tester-proxy'
import { FORMAT_DESCRIPTORS } from '../src/lib/converters/registry'

// Mac App Store builds: macOS already enforces one instance; skip Electron's lock there (NOTES-MAS.md M-05)
const ownsInstance = process.mas || app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
protocol.registerSchemesAsPrivileged([{ scheme: 'coil', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
const origin = 'coil://app'
const handlers: Record<string, (req: Request) => Promise<Response>> = {
  '/api/rewrite': rewrite, '/api/analyze': handleAnalysis, '/api/subtext': subtext,
  '/api/structure': structure, '/api/continuity': continuity, '/api/proofread': proofread,
}
let window: BrowserWindow | null = null
let ready = false
let quitting = false
let creating: Promise<void> | null = null
const pendingCommands: string[] = []
const documents = new Map<string, string>()
let pendingFiles: string[] = []
let opening = Promise.resolve()
const filters = [{ name: 'Screenplays', extensions: FORMAT_DESCRIPTORS.filter((format) => format.canImport).flatMap((format) => format.extensions.map((extension) => extension.slice(1))) }]

function report(error: unknown) {
  console.error('Coil:', error)
  if (quitting) return
  dialog.showErrorBox('Coil', error instanceof Error ? error.message : String(error))
}
function external(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url).catch(report)
}
function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent) {
  return Boolean(window && event.sender === window.webContents && event.senderFrame && event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url.startsWith(`${origin}/`))
}
function trusted(event: IpcMainInvokeEvent) {
  if (!isTrusted(event)) throw new Error('Untrusted document request')
}
// Stable identity of a file across launches: a hash of its real path. The path itself never reaches the renderer.
async function fileKeyOf(filePath: string) {
  return createHash('sha256').update(await realpath(filePath)).digest('hex')
}
async function readDocument(filePath: string) {
  if (!filters[0].extensions.includes(extname(filePath).slice(1).toLowerCase())) throw new Error('Unsupported screenplay format')
  const buffer = await readFile(filePath)
  const documentId = randomUUID()
  documents.set(documentId, filePath)
  return { documentId, fileKey: await fileKeyOf(filePath), name: basename(filePath), data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
}
function openFiles(files: string[]) {
  pendingFiles.push(...files)
  if (!ready || !window) return
  opening = opening.then(async () => {
    while (pendingFiles.length && window && ready) {
      const filePath = pendingFiles.shift()!
      try {
        const file = await readDocument(filePath)
        if (!window || !ready) { pendingFiles.unshift(filePath); break }
        window.webContents.send('coil:opened', file)
        window.show()
      } catch (error) { report(error) }
    }
  })
}
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  openFiles([filePath])
  if (app.isReady() && !window) void ensureWindow().catch(report)
})
app.on('second-instance', (_event, argv, cwd) => {
  openFiles(argv.filter((arg) => !arg.startsWith('--') && filters[0].extensions.includes(extname(arg).slice(1).toLowerCase())).map((file) => resolve(cwd, file)))
  void ensureWindow().then(() => {
    if (window?.isMinimized()) window.restore()
    window?.show()
    window?.focus()
  }).catch(report)
})

app.on('before-quit', () => { quitting = true })
app.on('window-all-closed', () => { /* macOS keeps the menu bar available. */ })

function ensureWindow(): Promise<void> {
  if (!ownsInstance || quitting || window) return Promise.resolve()
  if (!creating) creating = createWindow().finally(() => { creating = null })
  return creating
}
function flushCommands() {
  if (!ready || !window) return
  for (const action of pendingCommands.splice(0)) window.webContents.send('coil:command', action)
}

async function createWindow() {
  let bounds = { width: 1440, height: 960, x: undefined as number | undefined, y: undefined as number | undefined }
  let maximized = false
  try {
    const saved = JSON.parse(await readFile(join(app.getPath('userData'), 'window.json'), 'utf8'))
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height) && saved.width >= 800 && saved.height >= 600) {
      const visible = screen.getAllDisplays().some(({ workArea: a }) => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y)
      bounds = { width: saved.width, height: saved.height, x: visible ? saved.x : undefined, y: visible ? saved.y : undefined }
      maximized = saved.maximized === true
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Cannot restore window state:', error)
  }
  window = new BrowserWindow({ ...bounds, minWidth: 800, minHeight: 600, title: 'Coil', show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const current = window
  current.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' } })
  current.webContents.on('will-navigate', (event, url) => {
    if (url !== `${origin}/`) { event.preventDefault(); external(url) }
  })
  current.webContents.on('will-attach-webview', (event) => event.preventDefault())
  current.webContents.on('did-start-loading', () => { ready = false; documents.clear() })
  current.on('close', () => {
    const state = { ...current.getNormalBounds(), maximized: current.isMaximized() }
    // Synchronous write at close ensures Quit cannot exit before state reaches disk.
    try { require('node:fs').writeFileSync(join(app.getPath('userData'), 'window.json'), JSON.stringify(state)) }
    catch (error) { console.error('Cannot save window state:', error) }
  })
  current.on('closed', () => { window = null; ready = false; documents.clear() })
  await current.loadURL(`${origin}/`)
  if (quitting || current.isDestroyed()) return
  if (maximized) current.maximize()
  current.show()
}

if (ownsInstance) void app.whenReady().then(async () => {
  const assets = resolve(__dirname, '../dist')
  protocol.handle('coil', async (req) => {
    const url = new URL(req.url)
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 })
    if (url.pathname.startsWith('/api/')) {
      const handler = handlers[url.pathname]
      return handler ? routeApi(req, handler) : new Response('Not found', { status: 404 })
    }
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    let file: string
    try { file = resolve(assets, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`) }
    catch { return new Response('Invalid path', { status: 400 }) }
    if (!file.startsWith(assets + sep)) return new Response('Forbidden', { status: 403 })
    try {
      const response = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'")
      return new Response(response.body, { status: response.status, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(`${origin}/`) && !details.url.startsWith('devtools://') && !details.url.startsWith('file://') }))

  ipcMain.handle('coil:open', async (event) => {
    trusted(event)
    const result = await dialog.showOpenDialog(window!, { properties: ['openFile'], filters })
    if (result.canceled) return null
    const file = await readDocument(result.filePaths[0])
    return file
  })
  ipcMain.handle('coil:save', async (event, input: { name: string; data: ArrayBuffer; mode: string; documentId?: string | null }) => {
    trusted(event)
    if (!input || typeof input.name !== 'string' || !(input.data instanceof ArrayBuffer) ||
        !['save', 'saveAs', 'export'].includes(input.mode)) throw new Error('Invalid save request')
    const documentPath = input.documentId ? documents.get(input.documentId) : null
    let target = input.mode === 'save' && documentPath && basename(documentPath) === input.name && extname(documentPath).toLowerCase() === '.fountain' ? documentPath : null
    if (!target) {
      const result = await dialog.showSaveDialog(window!, { defaultPath: basename(input.name), filters: [{ name: 'Document', extensions: [extname(input.name).slice(1) || 'fountain'] }] })
      if (result.canceled || !result.filePath) return null
      target = result.filePath
    }
    await writeFile(target, Buffer.from(input.data))
    const documentId = input.mode === 'save' && input.documentId ? input.documentId : randomUUID()
    if (input.mode === 'saveAs' && input.documentId) documents.delete(input.documentId)
    if (input.mode !== 'export') documents.set(documentId, target)
    return { name: basename(target), documentId, ...(input.mode !== 'export' ? { fileKey: await fileKeyOf(target) } : {}) }
  })
  ipcMain.on('coil:ready', (event) => { if (!isTrusted(event)) return; ready = true; openFiles([]); flushCommands() })
  const command = (action: string) => {
    if (!window && action !== 'open') return
    pendingCommands.push(action)
    if (window) flushCommands()
    else void ensureWindow().catch(report)
  }
  const menu: MenuItemConstructorOptions[] = [
    { role: 'appMenu', label: 'Coil' },
    { label: 'File', submenu: [
      { id: 'open', label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => command('open') },
      { id: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => command('save') },
      { id: 'saveAs', label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => command('saveAs') },
      { label: 'Export', submenu: [
        { id: 'exportFountain', label: 'Fountain…', click: () => command('exportFountain') },
        { id: 'exportFDX', label: 'Final Draft…', click: () => command('exportFDX') },
        { label: 'PDF…', click: () => command('print') },
      ] },
      { type: 'separator' }, { role: 'close' },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Fountain Syntax', click: () => external('https://fountain.io/syntax/') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
  await ensureWindow()
  app.on('activate', () => { if (!window) void ensureWindow().catch(report) })
}).catch(report)
