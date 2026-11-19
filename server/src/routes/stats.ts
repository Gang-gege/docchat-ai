import { Router } from 'express'
import { embeddingBackend } from '../lib/embeddings.js'
import { ok } from '../middleware/error-handler.js'
import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'
import { env } from '../config/env.js'
import { dbPathInfo } from '../db/index.js'

export const statsRouter = Router()

statsRouter.get('/stats', (_req, res) => {
  const docs = documentStore.list()
  const totalSize = docs.reduce((s, d) => s + d.size, 0)
  const chunkCount = vectorStore.chunkCount()
  ok(res, {
    docCount: docs.length,
    chunkCount,
    totalSize,
    avgChunks: docs.length ? Number((chunkCount / docs.length).toFixed(1)) : 0,
    vectorBackend: vectorStore.backend(),
    db: 'sqlite',
    dbPath: dbPathInfo(),
    embedding: embeddingBackend(),
    llmConfigured: Boolean(env.llmApiKey),
    llmModel: env.llmModel,
    chunkSize: env.chunkSize,
    chunkOverlap: env.chunkOverlap,
    recentDocs: docs.slice(0, 5).map((d) => ({
      docId: d.docId,
      name: d.name,
      chunkCount: d.chunkCount,
      createdAt: d.createdAt,
    })),
    suggestions: docs.slice(0, 3).flatMap((d) => [
      `「${d.name}」主要讲了什么？`,
      `请总结「${d.name}」的要点`,
    ]),
  })
})
