/**
 * Version history — full-text snapshots per document (keyed by documentId).
 *
 * Snapshots are taken automatically (every AUTO_SNAPSHOT_INTERVAL_MS of editing activity, a session
 * baseline on the first edit, and before opening a different file), on demand before an AI edit
 * (`snapshotBeforeAI`), and manually ("Save version"). Restoring never destroys: the current text is
 * snapshotted first and the restore itself is recorded as a new version.
 */

import { useEditorStore } from '../store/editor-store'
import { type VersionKind, type VersionRecord, db } from './persistence'

export type { VersionKind, VersionRecord }

/** Minutes of editing between automatic snapshots. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
/** Unprotected (automatic) versions kept per document; manual / restore ones are never pruned. */
export const MAX_AUTO_VERSIONS = 50

/** Kinds the user created on purpose — never pruned, and a duplicate of the latest text upgrades it instead of vanishing. */
const PROTECTED: ReadonlySet<VersionKind> = new Set(['manual', 'restore', 'pre-restore'])

/**
 * Store a snapshot. Identical to the latest version → no new row (a protected kind relabels the
 * latest instead). Prunes automatic versions beyond MAX_AUTO_VERSIONS.
 */
export async function addVersion(
  documentId: string,
  content: string,
  kind: VersionKind,
  label?: string,
): Promise<VersionRecord | null> {
  return db.transaction('rw', db.versions, async () => {
    const latest = await db.versions.where('documentId').equals(documentId).last()
    if (latest?.id !== undefined && latest.content === content) {
      if (PROTECTED.has(kind) && !PROTECTED.has(latest.kind)) {
        const upgraded = { kind, label: label ?? latest.label }
        await db.versions.update(latest.id, upgraded)
        return { ...latest, ...upgraded }
      }
      if (PROTECTED.has(kind) && label && label !== latest.label) {
        await db.versions.update(latest.id, { label })
        return { ...latest, label }
      }
      return null
    }
    const record: VersionRecord = { documentId, createdAt: Date.now(), kind, label, content }
    record.id = await db.versions.add(record)
    const auto = await db.versions
      .where('documentId')
      .equals(documentId)
      .filter((v) => !PROTECTED.has(v.kind))
      .primaryKeys()
    if (auto.length > MAX_AUTO_VERSIONS) await db.versions.bulkDelete(auto.slice(0, auto.length - MAX_AUTO_VERSIONS))
    return record
  })
}

/** Versions of one document, newest first. */
export async function listVersions(documentId: string): Promise<VersionRecord[]> {
  const rows = await db.versions.where('documentId').equals(documentId).toArray()
  return rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
}

// ── Line diff ────────────────────────────────────────────

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

const MAX_LCS_CELLS = 4_000_000

/** Line diff from `a` to `b`: common head/tail trimmed, LCS on the middle (block replace if it is huge). */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split('\n')
  const y = b.split('\n')
  let head = 0
  while (head < x.length && head < y.length && x[head] === y[head]) head++
  let tail = 0
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++
  const mx = x.slice(head, x.length - tail)
  const my = y.slice(head, y.length - tail)
  const out: DiffLine[] = x.slice(0, head).map((text) => ({ type: 'same', text }))

  if (mx.length * my.length > MAX_LCS_CELLS) {
    for (const text of mx) out.push({ type: 'remove', text })
    for (const text of my) out.push({ type: 'add', text })
  } else {
    const w = my.length + 1
    const lcs = new Uint32Array((mx.length + 1) * w)
    for (let i = mx.length - 1; i >= 0; i--) {
      for (let j = my.length - 1; j >= 0; j--) {
        lcs[i * w + j] =
          mx[i] === my[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < mx.length && j < my.length) {
      if (mx[i] === my[j]) {
        out.push({ type: 'same', text: mx[i] })
        i++
        j++
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        out.push({ type: 'remove', text: mx[i++] })
      } else {
        out.push({ type: 'add', text: my[j++] })
      }
    }
    while (i < mx.length) out.push({ type: 'remove', text: mx[i++] })
    while (j < my.length) out.push({ type: 'add', text: my[j++] })
  }
  for (const text of x.slice(x.length - tail)) out.push({ type: 'same', text })
  return out
}

/** Added / removed line counts going from `from` to `to`. */
export function lineDelta(from: string, to: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of diffLines(from, to)) {
    if (l.type === 'add') added++
    else if (l.type === 'remove') removed++
  }
  return { added, removed }
}

// ── Store-aware actions ──────────────────────────────────

/** The live text: the editor view when mounted (always current), else the store. */
function currentText(): string | null {
  const s = useEditorStore.getState()
  return s.viewRef?.current?.state.doc.toString() ?? s.content
}

/** Save a labelled, never-pruned version of the open document. */
export async function saveVersion(label?: string): Promise<VersionRecord | null> {
  const { documentId } = useEditorStore.getState()
  const text = currentText()
  if (!documentId || text === null) return null
  return addVersion(documentId, text, 'manual', label?.trim() || undefined)
}

/**
 * Snapshot the open document right before an AI-accepted edit is applied. Await it: if it rejects,
 * the edit should not go ahead.
 */
export async function snapshotBeforeAI(reason: string): Promise<VersionRecord | null> {
  const { documentId } = useEditorStore.getState()
  const text = currentText()
  if (!documentId || text === null) return null
  return addVersion(documentId, text, 'ai', reason)
}

/**
 * Restore a version into the editor. Snapshots the current text first, replaces the document
 * (one undoable editor change), and records the restore as a NEW version. Nothing is deleted.
 */
export async function restoreVersion(versionId: number): Promise<VersionRecord | null> {
  const { documentId } = useEditorStore.getState()
  const view = useEditorStore.getState().viewRef?.current
  const version = await db.versions.get(versionId)
  // After every await: still the same document (and editor view)? Otherwise the user moved on; touch nothing.
  const sameDocument = () => {
    const s = useEditorStore.getState()
    return s.documentId === documentId && s.viewRef?.current === view
  }
  if (!version || !documentId || version.documentId !== documentId || !sameDocument()) return null
  const current = currentText()
  if (current === null) return null

  await addVersion(documentId, current, 'pre-restore', 'Before restore')
  if (!sameDocument()) return null

  if (view) {
    // onUpdate then syncs the store, stats and autosave.
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: version.content } })
  } else {
    const { fileName, desktopDocumentId, fileKey } = useEditorStore.getState()
    if (fileName) {
      useEditorStore
        .getState()
        .openFile(fileName, version.content, desktopDocumentId ?? undefined, documentId, fileKey ?? undefined)
    }
  }
  const label = `Restored from ${new Date(version.createdAt).toLocaleString()}`
  return addVersion(documentId, version.content, 'restore', label)
}

let installed: (() => void) | null = null

/**
 * Start automatic snapshots (idempotent): a baseline on the first edit of a session, one per
 * AUTO_SNAPSHOT_INTERVAL_MS of further activity, and one of the previous document when another opens.
 */
export function installVersionHistory(): () => void {
  if (installed) return installed
  const lastAuto = new Map<string, number>()
  const warn = (e: unknown) => console.warn('version snapshot failed', e)

  const unsubscribe = useEditorStore.subscribe((s, prev) => {
    if (s.documentVersion !== prev.documentVersion) {
      if (prev.documentId && prev.content !== null) {
        addVersion(prev.documentId, prev.content, 'open', 'Before opening another file').catch(warn)
      }
      return
    }
    if (!s.documentId || s.content === null || s.content === prev.content) return
    const now = Date.now()
    const last = lastAuto.get(s.documentId)
    if (last === undefined) {
      lastAuto.set(s.documentId, now)
      if (prev.content) addVersion(s.documentId, prev.content, 'auto', 'Session start').catch(warn)
    } else if (now - last >= AUTO_SNAPSHOT_INTERVAL_MS) {
      lastAuto.set(s.documentId, now)
      addVersion(s.documentId, s.content, 'auto').catch(warn)
    }
  })
  installed = () => {
    unsubscribe()
    installed = null
  }
  return installed
}
