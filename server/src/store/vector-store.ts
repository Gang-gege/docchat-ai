import { getDb, persistDb } from '../db/index.js'
import { localEmbed } from '../lib/embeddings.js'
import type { Citation, VectorChunk } from '../types/index.js'

const EMBED_REV = 'cjk-bigram-1'

function nameBoost(query: string, docName: string, content: string) {
  const chars = query.match(/[\u4e00-\u9fff]/g) || []
  const grams: string[] = []
  for (let i = 0; i < chars.length - 1; i++) grams.push(chars[i] + chars[i + 1])
  if (!grams.length) return 0
  const head = content.slice(0, 180)
  let named = 0
  let seen = 0
  for (const gram of grams) {
    if (docName.includes(gram)) named += 1
    if (head.includes(gram)) seen += 1
  }
  return (named / grams.length) * 0.35 + (seen / grams.length) * 0.12
}

function cosine(a: number[], b: number[]) {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom ? dot / denom : 0
}

function readAllChunks(): VectorChunk[] {
  const db = getDb()
  const stmt = db.prepare('SELECT id, doc_id, doc_name, content, embedding FROM chunks')
  const list: VectorChunk[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: string
      doc_id: string
      doc_name: string
      content: string
      embedding: string
    }
    list.push({
      id: row.id,
      docId: row.doc_id,
      docName: row.doc_name,
      content: row.content,
      embedding: JSON.parse(row.embedding) as number[],
    })
  }
  stmt.free()
  return list
}

export const vectorStore = {
  backend() {
    return 'sqlite'
  },
  chunkCount() {
    const db = getDb()
    const stmt = db.prepare('SELECT COUNT(*) as c FROM chunks')
    stmt.step()
    const c = Number((stmt.getAsObject() as { c: number }).c || 0)
    stmt.free()
    return c
  },
  snapshot() {
    return readAllChunks().map(({ id, docId, docName, content }) => ({ id, docId, docName, content }))
  },
  listByDoc(docId: string) {
    return readAllChunks()
      .filter((c) => c.docId === docId)
      .map(({ id, docId: d, docName, content }) => ({
        id,
        docId: d,
        docName,
        content,
        preview: content.slice(0, 160),
      }))
  },
  clearAll() {
    const db = getDb()
    db.run('DELETE FROM chunks')
    persistDb()
  },
  keywordSearch(keyword: string, limit = 5) {
    const q = keyword.trim().toLowerCase()
    if (!q) return []
    return readAllChunks()
      .filter((c) => c.content.toLowerCase().includes(q) || c.docName.toLowerCase().includes(q))
      .slice(0, limit)
      .map((c) => ({
        docId: c.docId,
        docName: c.docName,
        content: c.content.slice(0, 240),
      }))
  },
  async add(chunks: VectorChunk[]) {
    if (!chunks.length) return
    const db = getDb()
    const now = new Date().toISOString()
    const insert = db.prepare(
      `INSERT OR REPLACE INTO chunks (id, doc_id, doc_name, content, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const chunk of chunks) {
      insert.run([chunk.id, chunk.docId, chunk.docName, chunk.content, JSON.stringify(chunk.embedding), now])
    }
    insert.free()
    persistDb()
  },
  async removeByDoc(docId: string) {
    const db = getDb()
    db.run('DELETE FROM chunks WHERE doc_id = ?', [docId])
    persistDb()
  },
  async refreshLocalEmbeddings() {
    const db = getDb()
    db.run('CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)')
    const read = db.prepare(`SELECT v FROM app_meta WHERE k = 'embed_rev'`)
    let current = ''
    if (read.step()) current = String((read.getAsObject() as { v?: string }).v || '')
    read.free()
    if (current === EMBED_REV) return 0
    const chunks = readAllChunks()
    const update = db.prepare('UPDATE chunks SET embedding = ? WHERE id = ?')
    for (const chunk of chunks) update.run([JSON.stringify(localEmbed(chunk.content)), chunk.id])
    update.free()
    db.run(
      `INSERT INTO app_meta (k, v) VALUES ('embed_rev', ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      [EMBED_REV],
    )
    persistDb()
    return chunks.length
  },
  async search(queryEmbedding: number[], topK: number, docIds?: string[], query = ''): Promise<Citation[]> {
    const allow = docIds?.length ? new Set(docIds) : null
    const best = new Map<string, Citation>()
    for (const chunk of readAllChunks()) {
      if (allow && !allow.has(chunk.docId)) continue
      const score = cosine(queryEmbedding, chunk.embedding) + nameBoost(query, chunk.docName, chunk.content)
      const prev = best.get(chunk.docId)
      if (!prev || score > prev.score) {
        best.set(chunk.docId, { docId: chunk.docId, docName: chunk.docName, content: chunk.content, score })
      }
    }
    return [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  },
}
