import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nanoid } from 'nanoid'
import { AppError } from '../middleware/error-handler.js'
import { embedTexts } from '../lib/embeddings.js'
import { ocrImage } from '../lib/ocr.js'
import { parsePdf } from '../lib/pdf.js'
import { splitText } from '../lib/splitter.js'
import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'
import type { DocMeta } from '../types/index.js'

const ALLOWED = new Set(['.md', '.markdown', '.pdf', '.txt', '.png', '.jpg', '.jpeg', '.webp'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const storageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../storage')

/** multer 常把中文文件名按 latin1 解读，需转回 UTF-8 */
export function decodeOriginalName(name: string) {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    if (!decoded.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(decoded)) return decoded
    if (/[\u4e00-\u9fff]/.test(name)) return name
    return decoded.includes('\uFFFD') ? name : decoded
  } catch {
    return name
  }
}

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180)
}

function pullTables(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const tableLines = lines.filter((line) => (line.match(/\|/g) || []).length >= 2 || line.split(/\t+/).length >= 3)
  if (!tableLines.length) return text
  return `${text}\n\n【提取的表格行】\n${tableLines.join('\n')}`
}

export async function extractText(filePath: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase()
  if (!ALLOWED.has(ext)) {
    throw new AppError(40001, `不支持的文件类型: ${ext}`, 400)
  }
  if (IMAGE_EXT.has(ext)) {
    const text = await ocrImage(filePath)
    if (!text) throw new AppError(40001, `图片「${originalName}」没有识别出文字`, 400)
    return text
  }
  if (ext === '.pdf') {
    const buf = await fsPromises.readFile(filePath)
    const parsed = await parsePdf(buf)
    const text = (parsed.text || '').trim()
    if (text.length < 20) {
      throw new AppError(40001, `PDF「${originalName}」几乎没有文字层。扫描件请先导出成图片再上传，走 OCR。`, 400)
    }
    return pullTables(text)
  }
  return pullTables(await fsPromises.readFile(filePath, 'utf8'))
}

export async function ingestPlainText(name: string, text: string) {
  const tmp = path.join(storageRoot, `_tmp_${Date.now()}.txt`)
  fs.mkdirSync(storageRoot, { recursive: true })
  await fsPromises.writeFile(tmp, text, 'utf8')
  return ingestFile({ path: tmp, originalname: name.endsWith('.txt') ? name : `${name}.txt`, size: Buffer.byteLength(text) })
}

export async function ingestWebPage(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError(40001, '网页地址不合法', 400)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new AppError(40001, '只支持 http/https', 400)
  const res = await fetch(parsed, { headers: { 'User-Agent': 'DocChatBot' } })
  if (!res.ok) throw new AppError(40001, `抓取失败 ${res.status}`, 400)
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200000)
  if (text.length < 40) throw new AppError(40001, '页面几乎没有正文', 400)
  const name = `${parsed.hostname}${parsed.pathname}`.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').slice(0, 80)
  return ingestPlainText(name || 'webpage', text)
}

export async function ingestFile(file: { path: string; originalname: string; size: number }): Promise<DocMeta> {
  const originalname = decodeOriginalName(file.originalname)
  const ext = path.extname(originalname).toLowerCase().replace('.', '') || 'md'
  const text = (await extractText(file.path, originalname)).trim()
  if (!text) {
    throw new AppError(40001, `文件「${originalname}」未解析到文本（扫描件 PDF 需 OCR）`, 400)
  }

  const pieces = await splitText(text)
  const embeddings = await embedTexts(pieces)
  const docId = `d_${nanoid(8)}`

  // 原文件持久化到 storage/{docId}/文件名
  const dir = path.join(storageRoot, docId)
  fs.mkdirSync(dir, { recursive: true })
  const storagePath = path.join(dir, safeFileName(originalname))
  await fsPromises.copyFile(file.path, storagePath)
  await fsPromises.unlink(file.path).catch(() => undefined)

  await vectorStore.add(
    pieces.map((content, i) => ({
      id: `${docId}_${i}`,
      docId,
      docName: originalname,
      content,
      embedding: embeddings[i],
    })),
  )

  const meta: DocMeta = {
    docId,
    name: originalname,
    ext,
    size: file.size,
    chunkCount: pieces.length,
    createdAt: new Date().toISOString(),
    storagePath,
  }
  documentStore.upsert({ ...meta, storagePath })
  return meta
}

export async function removeDoc(docId: string) {
  const doc = documentStore.get(docId)
  if (!doc) throw new AppError(40401, '文档不存在', 404)

  documentStore.remove(docId)
  await vectorStore.removeByDoc(docId)

  const dir = path.join(storageRoot, docId)
  await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  return docId
}

export async function removeDocs(docIds: string[]) {
  const removed: string[] = []
  for (const id of docIds) {
    try {
      removed.push(await removeDoc(id))
    } catch {
      /* skip missing */
    }
  }
  return removed
}

export async function clearKnowledgeBase() {
  const docs = documentStore.list()
  documentStore.clearAll()
  vectorStore.clearAll()
  await fsPromises.rm(storageRoot, { recursive: true, force: true }).catch(() => undefined)
  fs.mkdirSync(storageRoot, { recursive: true })
  return { removedDocs: docs.length }
}

/** 基于已落盘原文件重新切片 + 向量化 */
export async function reindexDoc(docId: string) {
  const doc = documentStore.get(docId)
  if (!doc) throw new AppError(40401, '文档不存在', 404)
  const filePath = doc.storagePath
  if (!filePath || !fs.existsSync(filePath)) {
    throw new AppError(40001, '原文件不存在，无法重索引（请重新上传）', 400)
  }
  const text = (await extractText(filePath, doc.name)).trim()
  if (!text) throw new AppError(40001, '未能解析到文本', 400)
  const pieces = await splitText(text)
  const embeddings = await embedTexts(pieces)
  await vectorStore.removeByDoc(docId)
  await vectorStore.add(
    pieces.map((content, i) => ({
      id: `${docId}_${i}`,
      docId,
      docName: doc.name,
      content,
      embedding: embeddings[i],
    })),
  )
  const next = {
    ...doc,
    chunkCount: pieces.length,
    storagePath: filePath,
  }
  documentStore.upsert(next)
  return next
}

export function getStorageRoot() {
  return storageRoot
}
