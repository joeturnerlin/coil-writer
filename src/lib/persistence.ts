import Dexie, { type EntityTable } from 'dexie'

/**
 * Dexie database for auto-save.
 * Documents are keyed by a stable `documentId` (uuid); fileName is only a display name.
 */

/** Autosave debounce. Single constant; flushSave also runs on unmount / beforeunload. */
export const AUTOSAVE_INTERVAL_MS = 2000

export function newDocumentId(): string {
  return crypto.randomUUID()
}

interface DocumentRecord {
  id?: number
  documentId: string
  fileName: string
  content: string
  lastModified: number
  /** Desktop only: sha256 of the file's real path (computed in the main process), so a reopened file finds its document. */
  fileKey?: string
}

interface VoiceProfileRecord {
  id?: number
  sourceHash: string
  profile: string // JSON-serialized VoiceProfile
  createdAt: number
}

interface ProfileOverrideRecord {
  id?: number
  documentId?: string
  fileName: string
  characterName: string
  overrides: string
  source: 'manual' | 'analysis'
  updatedAt: number
}

interface AnnotationRecord {
  id?: number
  documentId?: string
  fileName: string
  annotationId: string
  data: string
  anchorHeading?: string
  anchorContext?: string
  createdAt: number
}

interface PendingDeltaRecord {
  id?: number
  documentId?: string
  fileName: string
  characterName: string
  original: string
  accepted: string
  createdAt: number
}

export type VersionKind = 'auto' | 'manual' | 'ai' | 'open' | 'pre-restore' | 'restore'

export interface VersionRecord {
  id?: number
  documentId: string
  createdAt: number
  kind: VersionKind
  label?: string
  content: string
}

interface UsageRecord {
  id?: number
  feature: string
  count: number
  period: string // "2026-03" or "2026-03-15"
  updatedAt: number
}

export const db = new Dexie('RecoilFountainEditor') as Dexie & {
  documents: EntityTable<DocumentRecord, 'id'>
  voiceProfiles: EntityTable<VoiceProfileRecord, 'id'>
  profileOverrides: EntityTable<ProfileOverrideRecord, 'id'>
  annotations: EntityTable<AnnotationRecord, 'id'>
  pendingDeltas: EntityTable<PendingDeltaRecord, 'id'>
  usage: EntityTable<UsageRecord, 'id'>
  versions: EntityTable<VersionRecord, 'id'>
}

db.version(1).stores({
  documents: '++id, fileName, lastModified',
})

db.version(2).stores({
  documents: '++id, fileName, lastModified',
  voiceProfiles: '++id, sourceHash, createdAt',
})

db.version(3).stores({
  documents: '++id, fileName, lastModified',
  voiceProfiles: '++id, sourceHash, createdAt',
  profileOverrides: '++id, fileName, [fileName+characterName], updatedAt',
  annotations: '++id, fileName, annotationId, createdAt',
  pendingDeltas: '++id, fileName, characterName, createdAt',
})

db.version(4).stores({
  documents: '++id, fileName, lastModified',
  voiceProfiles: '++id, sourceHash, createdAt',
  profileOverrides: '++id, fileName, [fileName+characterName], updatedAt',
  annotations: '++id, fileName, annotationId, createdAt',
  pendingDeltas: '++id, fileName, characterName, createdAt',
  usage: '++id, [feature+period], updatedAt',
})

/**
 * v5 migration helper: one new documentId per distinct fileName (used for legacy rows that have no
 * document row of their own).
 */
export function buildDocumentIdMap(fileNames: string[], makeId: () => string = newDocumentId): Map<string, string> {
  const map = new Map<string, string>()
  for (const name of fileNames) if (!map.has(name)) map.set(name, makeId())
  return map
}

db.version(5)
  .stores({
    documents: '++id, &documentId, fileName, lastModified',
    voiceProfiles: '++id, sourceHash, createdAt',
    profileOverrides: '++id, fileName, documentId, [fileName+characterName], [documentId+characterName], updatedAt',
    annotations: '++id, fileName, documentId, annotationId, createdAt',
    pendingDeltas: '++id, fileName, documentId, characterName, createdAt',
    usage: '++id, [feature+period], updatedAt',
    versions: '++id, documentId, createdAt',
  })
  .upgrade(async (tx) => {
    // Legacy saves were not transactional, so two document rows can share a fileName. Every row gets its OWN
    // id (documentId is unique); rows keyed only by fileName follow the NEWEST document with that name.
    const docs: DocumentRecord[] = await tx.table('documents').toArray()
    docs.sort((a, b) => a.lastModified - b.lastModified || (a.id ?? 0) - (b.id ?? 0))
    const rowIds = new Map<number, string>()
    const newest = new Map<string, string>()
    for (const d of docs) {
      const documentId = newDocumentId()
      rowIds.set(d.id as number, documentId)
      newest.set(d.fileName, documentId)
    }
    await tx
      .table('documents')
      .toCollection()
      .modify((row) => {
        row.documentId = rowIds.get(row.id)
      })
    const related = ['profileOverrides', 'annotations', 'pendingDeltas'] as const
    const orphans: string[] = []
    for (const t of related) {
      for (const r of await tx.table(t).toArray()) if (!newest.has(r.fileName)) orphans.push(r.fileName)
    }
    for (const [name, id] of buildDocumentIdMap(orphans)) newest.set(name, id)
    for (const t of related) {
      await tx
        .table(t)
        .toCollection()
        .modify((row) => {
          row.documentId = newest.get(row.fileName)
        })
    }
  })

// v6: a stable fileKey (desktop) lets a reopened file find the document whose history it already has.
db.version(6).stores({
  documents: '++id, &documentId, fileName, lastModified, fileKey',
  voiceProfiles: '++id, sourceHash, createdAt',
  profileOverrides: '++id, fileName, documentId, [fileName+characterName], [documentId+characterName], updatedAt',
  annotations: '++id, fileName, documentId, annotationId, createdAt',
  pendingDeltas: '++id, fileName, documentId, characterName, createdAt',
  usage: '++id, [feature+period], updatedAt',
  versions: '++id, documentId, createdAt',
})

// A recovered document's id, so callers that still call openFile(name, content) keep the same identity.
let recoveredHint: { documentId: string; fileName: string; content: string } | null = null

/** Forget the recovered hint: an explicit id was used, so a later open of the same text must not adopt it. */
export function clearRecoveredHint(): void {
  recoveredHint = null
}

/** Returns the documentId for a just-recovered document (once), else null. */
export function claimRecoveredId(fileName: string, content: string): string | null {
  const hint = recoveredHint
  if (hint && hint.fileName === fileName && hint.content === content) {
    recoveredHint = null
    return hint.documentId
  }
  return null
}

/**
 * Save or update a document in IndexedDB, keyed by documentId.
 * Resolves only when the Dexie transaction has committed; rejects on failure.
 */
// Strictly increasing save stamps: two saves in the same millisecond must still order correctly for recovery.
let lastSaveStamp = 0
function nextSaveStamp(): number {
  lastSaveStamp = Math.max(Date.now(), lastSaveStamp + 1)
  return lastSaveStamp
}

export async function saveToDB(
  documentId: string,
  fileName: string,
  content: string,
  fileKey?: string | null,
): Promise<void> {
  // One rw transaction so concurrent saves can't both see "no row" and each add one.
  await db.transaction('rw', db.documents, async () => {
    const lastModified = nextSaveStamp()
    const existing = await db.documents.where('documentId').equals(documentId).first()
    if (existing?.id !== undefined) {
      await db.documents.update(existing.id, {
        fileName,
        content,
        lastModified,
        ...(fileKey ? { fileKey } : {}),
      })
    } else {
      await db.documents.add({
        documentId,
        fileName,
        content,
        lastModified,
        ...(fileKey ? { fileKey } : {}),
      })
    }
  })
}

/** Point a stored document at a file (Save As). No row yet → nothing to update; the next autosave carries the key. */
export async function setDocumentFileKey(documentId: string, fileKey: string): Promise<void> {
  await db.transaction('rw', db.documents, async () => {
    // One file belongs to one document: whoever held this path before (Save As onto it) lets go.
    await db.documents
      .where('fileKey')
      .equals(fileKey)
      .filter((d) => d.documentId !== documentId)
      .modify({ fileKey: undefined })
    await db.documents.where('documentId').equals(documentId).modify({ fileKey })
  })
}

/** The stored document for a desktop file key (newest if several), or null. */
export async function findDocumentByFileKey(fileKey: string): Promise<{ documentId: string; content: string } | null> {
  const rows = await db.documents.where('fileKey').equals(fileKey).toArray()
  rows.sort((a, b) => b.lastModified - a.lastModified)
  return rows[0] ? { documentId: rows[0].documentId, content: rows[0].content } : null
}

/** Web has no paths: a stored document is "the same file" only if its name AND text are identical (newest wins). */
export async function findDocumentByNameAndContent(fileName: string, content: string): Promise<string | null> {
  const rows = await db.documents
    .where('fileName')
    .equals(fileName)
    .filter((d) => d.content === content)
    .toArray()
  rows.sort((a, b) => b.lastModified - a.lastModified)
  return rows[0]?.documentId ?? null
}

/**
 * Get the most recently saved document (for session recovery).
 */
export async function getRecoveredDocument(): Promise<{
  documentId: string
  fileName: string
  content: string
} | null> {
  const doc = await db.documents.orderBy('lastModified').last()
  if (!doc) return null
  recoveredHint = { documentId: doc.documentId, fileName: doc.fileName, content: doc.content }
  return { documentId: doc.documentId, fileName: doc.fileName, content: doc.content }
}

/**
 * Get a specific document by id.
 */
export async function getDocument(documentId: string): Promise<string | null> {
  const doc = await db.documents.where('documentId').equals(documentId).first()
  return doc?.content ?? null
}

/**
 * Save or update a voice profile by source hash.
 */
export async function saveVoiceProfile(sourceHash: string, profile: string): Promise<void> {
  const existing = await db.voiceProfiles.where('sourceHash').equals(sourceHash).first()
  if (existing?.id !== undefined) {
    await db.voiceProfiles.update(existing.id, { profile, createdAt: Date.now() })
  } else {
    await db.voiceProfiles.add({ sourceHash, profile, createdAt: Date.now() })
  }
}

/**
 * Get a voice profile by source hash.
 */
export async function getVoiceProfile(sourceHash: string): Promise<string | null> {
  const record = await db.voiceProfiles.where('sourceHash').equals(sourceHash).first()
  return record?.profile ?? null
}

/**
 * Delete a voice profile by source hash.
 */
export async function deleteVoiceProfile(sourceHash: string): Promise<void> {
  await db.voiceProfiles.where('sourceHash').equals(sourceHash).delete()
}

// ── Profile Overrides ────────────────────────────────────
// Keyed by documentId when given (callers should pass it); legacy fileName-only calls still work.

/**
 * Save or update a profile override.
 * Manual source wins over analysis — won't downgrade manual to analysis.
 */
export async function saveProfileOverride(
  fileName: string,
  characterName: string,
  overrides: string,
  source: 'manual' | 'analysis',
  documentId?: string,
): Promise<void> {
  const existing = documentId
    ? await db.profileOverrides.where('[documentId+characterName]').equals([documentId, characterName]).first()
    : await db.profileOverrides.where('[fileName+characterName]').equals([fileName, characterName]).first()

  if (existing?.id !== undefined) {
    // Don't downgrade manual → analysis
    if (existing.source === 'manual' && source === 'analysis') return
    await db.profileOverrides.update(existing.id, {
      overrides,
      source,
      updatedAt: Date.now(),
    })
  } else {
    await db.profileOverrides.add({
      documentId,
      fileName,
      characterName,
      overrides,
      source,
      updatedAt: Date.now(),
    })
  }
}

/**
 * Get all profile overrides for a document (by documentId when given, else fileName).
 */
export async function getProfileOverrides(
  fileName: string,
  documentId?: string,
): Promise<{ characterName: string; overrides: string; source: 'manual' | 'analysis' }[]> {
  const records = documentId
    ? await db.profileOverrides.where('documentId').equals(documentId).toArray()
    : await db.profileOverrides.where('fileName').equals(fileName).toArray()
  return records.map((r) => ({
    characterName: r.characterName,
    overrides: r.overrides,
    source: r.source,
  }))
}

/**
 * Delete all profile overrides for a document.
 */
export async function deleteProfileOverrides(fileName: string, documentId?: string): Promise<void> {
  if (documentId) await db.profileOverrides.where('documentId').equals(documentId).delete()
  else await db.profileOverrides.where('fileName').equals(fileName).delete()
}

// ── Pending Deltas ───────────────────────────────────────

/**
 * Save a pending delta (accepted rewrite that should feed back into voice analysis).
 */
export async function savePendingDelta(
  fileName: string,
  characterName: string,
  original: string,
  accepted: string,
  documentId?: string,
): Promise<void> {
  await db.pendingDeltas.add({
    documentId,
    fileName,
    characterName,
    original,
    accepted,
    createdAt: Date.now(),
  })
}

/**
 * Get all pending deltas for a document (by documentId when given, else fileName).
 */
export async function getPendingDeltas(
  fileName: string,
  documentId?: string,
): Promise<{ characterName: string; original: string; accepted: string }[]> {
  const records = documentId
    ? await db.pendingDeltas.where('documentId').equals(documentId).toArray()
    : await db.pendingDeltas.where('fileName').equals(fileName).toArray()
  return records.map((r) => ({
    characterName: r.characterName,
    original: r.original,
    accepted: r.accepted,
  }))
}

/**
 * Clear all pending deltas for a document (after re-analysis).
 */
export async function clearPendingDeltas(fileName: string, documentId?: string): Promise<void> {
  if (documentId) await db.pendingDeltas.where('documentId').equals(documentId).delete()
  else await db.pendingDeltas.where('fileName').equals(fileName).delete()
}
