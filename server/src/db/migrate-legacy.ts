import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'
import type { DocMeta, VectorChunk } from '../types/index.js'

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

/**
 * 把升级 SQLite 之前的 docs.json / vectors.json 迁进数据库（只在库为空时执行一次）
 */
export async function migrateLegacyJsonIfNeeded() {
  if (documentStore.count() > 0 || vectorStore.chunkCount() > 0) return

  const docsFile = path.join(dataDir, 'docs.json')
  const vectorsFile = path.join(dataDir, 'vectors.json')
  if (!fs.existsSync(docsFile) && !fs.existsSync(vectorsFile)) return

  let docs: DocMeta[] = []
  let chunks: VectorChunk[] = []
  try {
    if (fs.existsSync(docsFile)) {
      docs = JSON.parse(fs.readFileSync(docsFile, 'utf8')) as DocMeta[]
    }
    if (fs.existsSync(vectorsFile)) {
      chunks = JSON.parse(fs.readFileSync(vectorsFile, 'utf8')) as VectorChunk[]
    }
  } catch (err) {
    console.warn('[DB] 读取旧 JSON 失败，跳过迁移', err)
    return
  }

  if (!docs.length && !chunks.length) return

  for (const doc of docs) {
    documentStore.upsert({
      ...doc,
      storagePath: doc.storagePath || '',
    })
  }
  if (chunks.length) {
    await vectorStore.add(chunks)
  }

  // 备份旧文件，避免反复迁移覆盖
  const stamp = Date.now()
  for (const file of [docsFile, vectorsFile]) {
    if (!fs.existsSync(file)) continue
    fs.renameSync(file, `${file}.migrated.${stamp}.bak`)
  }

  console.log(`[DB] 已迁移旧数据：documents=${docs.length}, chunks=${chunks.length}`)
}
