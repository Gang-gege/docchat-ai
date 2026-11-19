import { Router } from 'express'
import { runChatStream } from '../services/rag.service.js'
import type { ChatHistoryItem } from '../types/index.js'

export const chatRouter = Router()

function parseHistory(raw: unknown): ChatHistoryItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: String(item.content).slice(0, 2000),
    }))
    .slice(-12)
}

function parseDocIds(raw: unknown) {
  if (!Array.isArray(raw)) return undefined
  const ids = raw
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => String(item).trim())
    .slice(0, 20)
  return ids.length ? ids : undefined
}

function parseAnswerStyle(raw: unknown) {
  return raw === 'brief' || raw === 'outline' || raw === 'standard' ? raw : undefined
}

function setupSse(res: import('express').Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  return send
}

async function handleChat(
  res: import('express').Response,
  options: {
    question: string
    topK?: number
    temperature?: number
    enableAgent?: boolean
    enableRewrite?: boolean
    scoreThreshold?: number
    history?: ChatHistoryItem[]
    systemPrompt?: string
    docIds?: string[]
    answerStyle?: string
  },
) {
  const send = setupSse(res)
  const ac = new AbortController()
  res.on('close', () => ac.abort())

  try {
    await runChatStream(options, { send }, ac.signal)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '问答失败'
    if (!ac.signal.aborted) send('error', { msg })
  } finally {
    if (!res.writableEnded) res.end()
  }
}

/** 兼容旧版 EventSource GET */
chatRouter.get('/chat-stream', async (req, res) => {
  const question = String(req.query.question || '').trim()
  if (!question) {
    res.status(400).json({ code: 40001, msg: 'question 不能为空', data: null })
    return
  }
  await handleChat(res, {
    question,
    topK: req.query.topK ? Number(req.query.topK) : undefined,
    temperature: req.query.temperature ? Number(req.query.temperature) : undefined,
    enableAgent: req.query.enableAgent !== 'false',
    enableRewrite: req.query.enableRewrite !== 'false',
    scoreThreshold: req.query.scoreThreshold ? Number(req.query.scoreThreshold) : undefined,
  })
})

/** 推荐：POST 可带多轮 history，支持取消 */
chatRouter.post('/chat-stream', async (req, res) => {
  const question = String(req.body?.question || '').trim()
  if (!question) {
    res.status(400).json({ code: 40001, msg: 'question 不能为空', data: null })
    return
  }
  await handleChat(res, {
    question,
    topK: req.body?.topK != null ? Number(req.body.topK) : undefined,
    temperature: req.body?.temperature != null ? Number(req.body.temperature) : undefined,
    enableAgent: req.body?.enableAgent !== false,
    enableRewrite: req.body?.enableRewrite !== false,
    scoreThreshold: req.body?.scoreThreshold != null ? Number(req.body.scoreThreshold) : undefined,
    history: parseHistory(req.body?.history),
    systemPrompt: typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.slice(0, 4000) : undefined,
    docIds: parseDocIds(req.body?.docIds),
    answerStyle: parseAnswerStyle(req.body?.answerStyle),
  })
})
