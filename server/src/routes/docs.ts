import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import multer from 'multer'
import { AppError, ok } from '../middleware/error-handler.js'
import {
  clearKnowledgeBase,
  ingestFile,
  reindexDoc,
  removeDoc,
  removeDocs,
} from '../services/ingest.service.js'
import { summarizeDocument } from '../services/summary.service.js'
import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 8 },
})

export const docsRouter = Router()

docsRouter.get('/docs', (req, res) => {
  const q = String(req.query.q || '')
    .trim()
    .toLowerCase()
  let list = documentStore.list()
  if (q) list = list.filter((d) => d.name.toLowerCase().includes(q) || d.ext.toLowerCase().includes(q))
  ok(res, { list, total: list.length })
})

docsRouter.get('/doc/:docId', (req, res, next) => {
  try {
    const doc = documentStore.get(req.params.docId)
    if (!doc) throw new AppError(40401, '文档不存在', 404)
    const chunks = vectorStore.listByDoc(doc.docId)
    ok(res, {
      doc,
      chunks,
      hasFile: Boolean(doc.storagePath && fs.existsSync(doc.storagePath)),
    })
  } catch (err) {
    next(err)
  }
})

docsRouter.get('/doc/:docId/download', (req, res, next) => {
  try {
    const doc = documentStore.get(req.params.docId)
    if (!doc?.storagePath || !fs.existsSync(doc.storagePath)) {
      throw new AppError(40401, '原文件不存在', 404)
    }
    res.download(doc.storagePath, doc.name)
  } catch (err) {
    next(err)
  }
})

docsRouter.patch('/doc/:docId', (req, res, next) => {
  try {
    const favorite = typeof req.body?.favorite === 'boolean' ? req.body.favorite : undefined
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined
    const doc = documentStore.patch(req.params.docId, { favorite, note })
    if (!doc) throw new AppError(40401, '文档不存在', 404)
    ok(res, { doc })
  } catch (err) {
    next(err)
  }
})

docsRouter.post('/doc/:docId/summary', async (req, res, next) => {
  try {
    const doc = await summarizeDocument(req.params.docId)
    if (!doc) throw new AppError(40401, '文档不存在', 404)
    ok(res, { doc }, '摘要已生成')
  } catch (err) {
    next(err)
  }
})

docsRouter.post('/doc/:docId/reindex', async (req, res, next) => {
  try {
    const doc = await reindexDoc(req.params.docId)
    ok(res, { doc }, '重索引完成')
  } catch (err) {
    next(err)
  }
})

docsRouter.get('/search', (req, res) => {
  const keyword = String(req.query.keyword || '').trim()
  const limit = req.query.limit ? Number(req.query.limit) : 10
  if (!keyword) {
    res.status(400).json({ code: 40001, msg: 'keyword 不能为空', data: null })
    return
  }
  ok(res, { keyword, hits: vectorStore.keywordSearch(keyword, limit) })
})

docsRouter.post('/upload', upload.array('files', 8), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) || []
    if (!files.length) throw new AppError(40001, '请选择要上传的文件', 400)
    const docs = []
    for (const file of files) {
      docs.push(await ingestFile(file))
    }
    ok(res, { docs, docId: docs[0]?.docId }, '入库成功')
  } catch (err) {
    next(err)
  }
})

docsRouter.delete('/doc/:docId', async (req, res, next) => {
  try {
    const docId = await removeDoc(req.params.docId)
    ok(res, { docId }, '已删除')
  } catch (err) {
    next(err)
  }
})

docsRouter.post('/docs/batch-delete', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.docIds) ? (req.body.docIds as string[]) : []
    if (!ids.length) throw new AppError(40001, 'docIds 不能为空', 400)
    const removed = await removeDocs(ids)
    ok(res, { removed, count: removed.length }, '批量删除完成')
  } catch (err) {
    next(err)
  }
})

docsRouter.post('/docs/clear', async (_req, res, next) => {
  try {
    const result = await clearKnowledgeBase()
    ok(res, result, '知识库已清空')
  } catch (err) {
    next(err)
  }
})
