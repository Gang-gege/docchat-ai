import { Router } from 'express'
import { publicSettings } from '../config/env.js'
import { ok } from '../middleware/error-handler.js'
import { RAG_SYSTEM_PROMPT } from '../prompts/rag.js'

export const settingsRouter = Router()

settingsRouter.get('/settings', (_req, res) => {
  ok(res, {
    ...publicSettings(),
    defaultSystemPrompt: RAG_SYSTEM_PROMPT,
  })
})
