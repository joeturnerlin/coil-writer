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

const db = new Dexie('RecoilFountainEditor') as Dexie & {
  documents: EntityTable<DocumentRecord, 'id'>
}

db.version(1).stores({
  documents: '++id, fileName, lastModified',
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
