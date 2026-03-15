import Dexie, { type EntityTable } from 'dexie'

/**
 * Dexie database for auto-save.
 * Single table: documents with { id, fileName, content, lastModified }.
 */

interface DocumentRecord {
  id?: number
  fileName: string
  content: string
  lastModified: number
}

interface VoiceProfileRecord {
  id?: number
  sourceHash: string
  profile: string // JSON-serialized VoiceProfile
  createdAt: number
}

interface ProfileOverrideRecord {
  id?: number
  fileName: string
  characterName: string
  overrides: string
  source: 'manual' | 'analysis'
  updatedAt: number
}

interface AnnotationRecord {
  id?: number
  fileName: string
  annotationId: string
  data: string
  anchorHeading?: string
  anchorContext?: string
  createdAt: number
}

interface PendingDeltaRecord {
  id?: number
  fileName: string
  characterName: string
  original: string
  accepted: string
  createdAt: number
}

interface UsageRecord {
  id?: number
  feature: string
  count: number
  period: string // "2026-03" or "2026-03-15"
  updatedAt: number
}

const db = new Dexie('RecoilFountainEditor') as Dexie & {
  documents: EntityTable<DocumentRecord, 'id'>
  voiceProfiles: EntityTable<VoiceProfileRecord, 'id'>
  profileOverrides: EntityTable<ProfileOverrideRecord, 'id'>
  annotations: EntityTable<AnnotationRecord, 'id'>
  pendingDeltas: EntityTable<PendingDeltaRecord, 'id'>
  usage: EntityTable<UsageRecord, 'id'>
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
 * Save or update a document in IndexedDB.
 * Uses fileName as the logical key (upsert by fileName).
 */
export async function saveToDB(fileName: string, content: string): Promise<void> {
  const existing = await db.documents.where('fileName').equals(fileName).first()
  if (existing) {
    await db.documents.update(existing.id!, {
      content,
      lastModified: Date.now(),
    })
  } else {
    await db.documents.add({
      fileName,
      content,
      lastModified: Date.now(),
    })
  }
}

/**
 * Get the most recently saved document (for session recovery).
 */
export async function getRecoveredDocument(): Promise<{ fileName: string; content: string } | null> {
  const doc = await db.documents.orderBy('lastModified').last()
  if (!doc) return null
  return { fileName: doc.fileName, content: doc.content }
}

/**
 * Get a specific document by file name.
 */
export async function getDocument(fileName: string): Promise<string | null> {
  const doc = await db.documents.where('fileName').equals(fileName).first()
  return doc?.content ?? null
}

/**
 * Save or update a voice profile by source hash.
 */
export async function saveVoiceProfile(sourceHash: string, profile: string): Promise<void> {
  const existing = await db.voiceProfiles.where('sourceHash').equals(sourceHash).first()
  if (existing) {
    await db.voiceProfiles.update(existing.id!, { profile, createdAt: Date.now() })
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

/**
 * Save or update a profile override.
 * Manual source wins over analysis — won't downgrade manual to analysis.
 */
export async function saveProfileOverride(
  fileName: string,
  characterName: string,
  overrides: string,
  source: 'manual' | 'analysis',
): Promise<void> {
  const existing = await db.profileOverrides.where('[fileName+characterName]').equals([fileName, characterName]).first()

  if (existing) {
    // Don't downgrade manual → analysis
    if (existing.source === 'manual' && source === 'analysis') return
    await db.profileOverrides.update(existing.id!, {
      overrides,
      source,
      updatedAt: Date.now(),
    })
  } else {
    await db.profileOverrides.add({
      fileName,
      characterName,
      overrides,
      source,
      updatedAt: Date.now(),
    })
  }
}

/**
 * Get all profile overrides for a file.
 */
export async function getProfileOverrides(
  fileName: string,
): Promise<{ characterName: string; overrides: string; source: 'manual' | 'analysis' }[]> {
  const records = await db.profileOverrides.where('fileName').equals(fileName).toArray()
  return records.map((r) => ({
    characterName: r.characterName,
    overrides: r.overrides,
    source: r.source,
  }))
}

/**
 * Delete all profile overrides for a file.
 */
export async function deleteProfileOverrides(fileName: string): Promise<void> {
  await db.profileOverrides.where('fileName').equals(fileName).delete()
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
): Promise<void> {
  await db.pendingDeltas.add({
    fileName,
    characterName,
    original,
    accepted,
    createdAt: Date.now(),
  })
}

/**
 * Get all pending deltas for a file.
 */
export async function getPendingDeltas(
  fileName: string,
): Promise<{ characterName: string; original: string; accepted: string }[]> {
  const records = await db.pendingDeltas.where('fileName').equals(fileName).toArray()
  return records.map((r) => ({
    characterName: r.characterName,
    original: r.original,
    accepted: r.accepted,
  }))
}

/**
 * Clear all pending deltas for a file (after re-analysis).
 */
export async function clearPendingDeltas(fileName: string): Promise<void> {
  await db.pendingDeltas.where('fileName').equals(fileName).delete()
}
