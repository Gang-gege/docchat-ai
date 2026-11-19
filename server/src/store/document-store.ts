import { getDb, persistDb } from '../db/index.js'
import type { DocMeta } from '../types/index.js'

type DocRow = {
  doc_id: string
  name: string
  ext: string
  size: number
  chunk_count: number
  storage_path: string
  created_at: string
  summary?: string
  note?: string
  favorite?: number
}

function mapRow(row: DocRow): DocMeta {
  return {
    docId: row.doc_id,
    name: row.name,
    ext: row.ext,
    size: row.size,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    storagePath: row.storage_path,
    summary: row.summary || '',
    note: row.note || '',
    favorite: Number(row.favorite || 0) === 1,
  }
}

export const documentStore = {
  list(): DocMeta[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC')
    const rows: DocRow[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as DocRow)
    stmt.free()
    return rows.map(mapRow)
  },
  get(docId: string): DocMeta | undefined {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM documents WHERE doc_id = ?')
    stmt.bind([docId])
    const row = stmt.step() ? (stmt.getAsObject() as DocRow) : null
    stmt.free()
    return row ? mapRow(row) : undefined
  },
  upsert(doc: DocMeta & { storagePath: string }) {
    const db = getDb()
    db.run(
      `INSERT INTO documents (doc_id, name, ext, size, chunk_count, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET
         name=excluded.name,
         ext=excluded.ext,
         size=excluded.size,
         chunk_count=excluded.chunk_count,
         storage_path=excluded.storage_path,
         created_at=excluded.created_at`,
      [doc.docId, doc.name, doc.ext, doc.size, doc.chunkCount, doc.storagePath, doc.createdAt],
    )
    persistDb()
    return doc
  },
  remove(docId: string) {
    const existed = Boolean(this.get(docId))
    if (!existed) return false
    const db = getDb()
    db.run('DELETE FROM chunks WHERE doc_id = ?', [docId])
    db.run('DELETE FROM documents WHERE doc_id = ?', [docId])
    persistDb()
    return true
  },
  count() {
    const db = getDb()
    const stmt = db.prepare('SELECT COUNT(*) as c FROM documents')
    stmt.step()
    const c = Number((stmt.getAsObject() as { c: number }).c || 0)
    stmt.free()
    return c
  },
  clearAll() {
    const db = getDb()
    db.run('DELETE FROM chunks')
    db.run('DELETE FROM documents')
    persistDb()
  },
  patch(docId: string, fields: { favorite?: boolean; note?: string }) {
    const current = this.get(docId)
    if (!current) return undefined
    const db = getDb()
    if (typeof fields.favorite === 'boolean') {
      db.run('UPDATE documents SET favorite = ? WHERE doc_id = ?', [fields.favorite ? 1 : 0, docId])
    }
    if (typeof fields.note === 'string') {
      db.run('UPDATE documents SET note = ? WHERE doc_id = ?', [fields.note.slice(0, 1000), docId])
    }
    persistDb()
    return this.get(docId)
  },
  saveSummary(docId: string, summary: string) {
    const current = this.get(docId)
    if (!current) return undefined
    const db = getDb()
    db.run('UPDATE documents SET summary = ? WHERE doc_id = ?', [summary.slice(0, 800), docId])
    persistDb()
    return this.get(docId)
  },
}
