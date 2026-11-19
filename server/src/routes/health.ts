import { Router } from 'express'
import { embeddingBackend } from '../lib/embeddings.js'
import { ok } from '../middleware/error-handler.js'
import { vectorStore } from '../store/vector-store.js'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  ok(res, {
    ok: true,
    vectorBackend: vectorStore.backend(),
    embedding: embeddingBackend(),
  })
})
