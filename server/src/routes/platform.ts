import fs from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import { dbPathInfo, replaceDatabase } from '../db/index.js'
import { AppError, ok } from '../middleware/error-handler.js'
import { embedQuery } from '../lib/embeddings.js'
import { llmConfig } from '../config/runtime.js'
import { runEval } from '../services/eval.service.js'
import { ingestWebPage, reindexDoc } from '../services/ingest.service.js'
import { summarizeDocument } from '../services/summary.service.js'
import { runWorkflow } from '../services/workflow.service.js'
import { ensureLibrary, libraryStore, toPublicModel, type PromptTemplate, type WorkflowStep } from '../store/library-store.js'
import { vectorStore } from '../store/vector-store.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } })

export const platformRouter = Router()

platformRouter.get('/models', (_req, res) => {
  const active = libraryStore.activeModel()
  ok(res, {
    list: libraryStore.listModels().map(toPublicModel),
    activeId: active?.id || '',
    using: llmConfig().profileName,
  })
})

platformRouter.post('/models', (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) throw new AppError(40001, '模型名称不能为空', 400)
    const saved = libraryStore.saveModel({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      name,
      baseUrl: String(req.body?.baseUrl || ''),
      apiKey: String(req.body?.apiKey || ''),
      chatModel: String(req.body?.chatModel || ''),
      embeddingModel: String(req.body?.embeddingModel || ''),
      embeddingBaseUrl: String(req.body?.embeddingBaseUrl || ''),
      useLocalEmbedding: req.body?.useLocalEmbedding !== false,
    })
    ok(res, { model: saved ? toPublicModel(saved) : null })
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/models/:id/activate', (req, res, next) => {
  try {
    const active = libraryStore.activateModel(req.params.id)
    if (!active) throw new AppError(40401, '模型不存在', 404)
    ok(res, { model: toPublicModel(active) }, '已切换模型')
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/models/use-env', (_req, res) => {
  libraryStore.clearActiveModel()
  ok(res, { using: llmConfig().profileName }, '已改回环境变量')
})

platformRouter.delete('/models/:id', (req, res) => {
  libraryStore.removeModel(req.params.id)
  ok(res, { id: req.params.id })
})

platformRouter.get('/prompts', (_req, res) => {
  ok(res, { list: libraryStore.listPrompts() })
})

platformRouter.post('/prompts', (req, res, next) => {
  try {
    const kind = req.body?.kind
    if (kind !== 'qa' && kind !== 'summary' && kind !== 'extract') {
      throw new AppError(40001, 'kind 只能是 qa / summary / extract', 400)
    }
    const name = String(req.body?.name || '').trim()
    const content = String(req.body?.content || '').trim()
    if (!name || !content) throw new AppError(40001, '名称和内容不能为空', 400)
    const saved = libraryStore.savePrompt({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      name,
      kind: kind as PromptTemplate['kind'],
      content,
    })
    ok(res, { prompt: saved })
  } catch (err) {
    next(err)
  }
})

platformRouter.delete('/prompts/:id', (req, res) => {
  libraryStore.removePrompt(req.params.id)
  ok(res, { id: req.params.id })
})

platformRouter.post('/vector-search', async (req, res, next) => {
  try {
    const query = String(req.body?.query || '').trim()
    if (!query) throw new AppError(40001, 'query 不能为空', 400)
    const topK = Math.min(Math.max(Number(req.body?.topK) || 4, 1), 12)
    const docIds = Array.isArray(req.body?.docIds) ? (req.body.docIds as string[]) : undefined
    const hits = await vectorStore.search(await embedQuery(query), topK, docIds)
    ok(res, {
      query,
      topK,
      hits: hits.map((hit) => ({ ...hit, content: hit.content.slice(0, 280) })),
    })
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/ingest-url', async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim()
    if (!url) throw new AppError(40001, 'url 不能为空', 400)
    const doc = await ingestWebPage(url)
    ok(res, { doc }, '网页已入库')
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/docs/batch-reindex', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.docIds) ? (req.body.docIds as string[]) : []
    if (!ids.length) throw new AppError(40001, 'docIds 不能为空', 400)
    const docs = []
    const errors: string[] = []
    for (const id of ids.slice(0, 20)) {
      try {
        docs.push(await reindexDoc(id))
      } catch (err) {
        errors.push(err instanceof Error ? err.message : id)
      }
    }
    ok(res, { docs, errors })
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/docs/batch-summary', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.docIds) ? (req.body.docIds as string[]) : []
    if (!ids.length) throw new AppError(40001, 'docIds 不能为空', 400)
    const docs = []
    for (const id of ids.slice(0, 20)) {
      const doc = await summarizeDocument(id)
      if (doc) docs.push(doc)
    }
    ok(res, { docs, count: docs.length })
  } catch (err) {
    next(err)
  }
})

platformRouter.get('/eval/cases', (_req, res) => {
  ok(res, { list: libraryStore.listCases() })
})

platformRouter.post('/eval/cases', (req, res, next) => {
  try {
    const cases = Array.isArray(req.body?.cases) ? req.body.cases : []
    ok(res, { list: libraryStore.replaceCases(cases) })
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/eval/run', async (req, res, next) => {
  try {
    const cases = libraryStore.listCases()
    if (!cases.length) throw new AppError(40001, '请先保存测试问题', 400)
    const topK = Math.min(Math.max(Number(req.body?.topK) || 4, 1), 12)
    ok(res, await runEval(cases, topK))
  } catch (err) {
    next(err)
  }
})

platformRouter.get('/workflows', (_req, res) => {
  ok(res, { list: libraryStore.listWorkflows() })
})

platformRouter.post('/workflows', (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    const steps = Array.isArray(req.body?.steps) ? (req.body.steps as WorkflowStep[]) : []
    if (!name || !steps.length) throw new AppError(40001, '名称和步骤不能为空', 400)
    ok(res, { workflow: libraryStore.saveWorkflow({ id: req.body?.id, name, steps }) })
  } catch (err) {
    next(err)
  }
})

platformRouter.delete('/workflows/:id', (req, res) => {
  libraryStore.removeWorkflow(req.params.id)
  ok(res, { id: req.params.id })
})

platformRouter.post('/workflows/run', async (req, res, next) => {
  try {
    const steps = Array.isArray(req.body?.steps) ? (req.body.steps as WorkflowStep[]) : []
    const input = String(req.body?.input || '').trim()
    if (!steps.length || !input) throw new AppError(40001, '需要步骤和输入', 400)
    ok(res, await runWorkflow(steps, input))
  } catch (err) {
    next(err)
  }
})

platformRouter.post('/workflows/:id/run', async (req, res, next) => {
  try {
    const workflow = libraryStore.listWorkflows().find((item) => item.id === req.params.id)
    if (!workflow) throw new AppError(40401, '工作流不存在', 404)
    const input = String(req.body?.input || '').trim()
    if (!input) throw new AppError(40001, 'input 不能为空', 400)
    ok(res, await runWorkflow(workflow.steps, input))
  } catch (err) {
    next(err)
  }
})

platformRouter.get('/backup', (_req, res) => {
  const file = dbPathInfo()
  res.download(file, `docchat-backup-${Date.now()}.sqlite`)
})

platformRouter.post('/backup/import', upload.single('file'), (req, res, next) => {
  try {
    const file = req.file
    if (!file?.buffer?.length) throw new AppError(40001, '请上传 sqlite 备份文件', 400)
    replaceDatabase(new Uint8Array(file.buffer))
    ensureLibrary()
    ok(res, { bytes: file.size }, '备份已恢复，请刷新页面')
  } catch (err) {
    next(err)
  }
})

platformRouter.get('/backup/info', (_req, res) => {
  const file = dbPathInfo()
  const stat = fs.existsSync(file) ? fs.statSync(file) : null
  ok(res, { path: file, bytes: stat?.size || 0, engine: 'sqlite' })
})
