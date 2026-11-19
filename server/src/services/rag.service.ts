import { env } from '../config/env.js'
import { embedQuery } from '../lib/embeddings.js'
import { chatStream, type ChatMessage } from '../lib/llm.js'
import { buildRagUserPrompt, RAG_SYSTEM_PROMPT } from '../prompts/rag.js'
import { vectorStore } from '../store/vector-store.js'
import type { ChatRuntimeOptions, Citation } from '../types/index.js'
import { maybeRunAgent } from './agent.service.js'
import { rewriteQuery } from './rewrite.service.js'

export interface SseWriter {
  send: (event: string, data: unknown) => void
}

function clipContexts(items: Citation[]) {
  const kept: Citation[] = []
  let used = 0
  for (const item of items) {
    if (used + item.content.length > env.maxContextChars) {
      const remain = env.maxContextChars - used
      if (remain > 80) {
        kept.push({ ...item, content: item.content.slice(0, remain) })
      }
      break
    }
    kept.push(item)
    used += item.content.length
  }
  return kept
}

const STYLE_HINT: Record<string, string> = {
  brief: '回答风格：用不超过 120 字给出结论，不要展开背景。',
  outline: '回答风格：先用一句话给结论，再用 Markdown 列出 3 到 6 个要点。',
}

function withAnswerStyle(prompt: string, style?: string) {
  const hint = style ? STYLE_HINT[style] : ''
  return hint ? `${prompt}\n\n${hint}` : prompt
}

function formatHistory(history: { role: string; content: string }[]) {
  return history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 400)}`)
    .join('\n')
}

export async function runChatStream(options: ChatRuntimeOptions, sse: SseWriter, signal?: AbortSignal) {
  const topK = options.topK && options.topK > 0 ? options.topK : env.topK
  const temperature = options.temperature ?? env.llmTemperature
  const enableAgent = options.enableAgent !== false
  const enableRewrite = options.enableRewrite !== false
  const history = options.history || []
  const scoreThreshold = options.scoreThreshold ?? 0.05

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('客户端已取消生成')
  }

  if (enableAgent) {
    throwIfAborted()
    sse.send('status', { stage: 'agent' })
    let agentGenerating = false
    const agent = await maybeRunAgent(
      options.question,
      temperature,
      history,
      (text) => {
        throwIfAborted()
        if (!agentGenerating) {
          agentGenerating = true
          sse.send('status', { stage: 'generate' })
        }
        sse.send('token', { text })
      },
      signal,
    )
    for (const log of agent.logs) sse.send('agent', log)
    if (agent.usedTools && (agent.streamed || agent.directAnswer)) {
      if (!agent.streamed && agent.directAnswer) {
        const { emitTypedText } = await import('./agent.service.js')
        sse.send('status', { stage: 'generate' })
        await emitTypedText(agent.directAnswer, (text) => sse.send('token', { text }), signal)
      }
      sse.send('done', { ok: true, mode: 'agent' })
      return
    }
  }

  let retrieveQuery = options.question
  if (enableRewrite && history.length) {
    throwIfAborted()
    sse.send('status', { stage: 'rewrite' })
    const rewritten = await rewriteQuery(options.question, history, 0)
    retrieveQuery = rewritten.query
    if (rewritten.rewritten) {
      sse.send('rewrite', { original: options.question, query: retrieveQuery })
    }
  }

  throwIfAborted()
  sse.send('status', { stage: 'retrieve' })
  const queryVec = await embedQuery(retrieveQuery)
  const docIds = options.docIds?.filter(Boolean)
  if (docIds?.length) {
    sse.send('agent', { thought: `检索范围限定为 ${docIds.length} 篇文档` })
  }
  let citations = await vectorStore.search(queryVec, topK, docIds)
  // 阈值过高（尤其本地简易向量）会导致「有文档却 0 命中」
  const effectiveThreshold = Math.min(Math.max(scoreThreshold, 0), 0.35)
  if (effectiveThreshold > 0) {
    const filtered = citations.filter((c) => c.score >= effectiveThreshold)
    if (filtered.length) {
      citations = filtered
    } else if (citations.length) {
      sse.send('agent', {
        thought: `相似度阈值 ${scoreThreshold} 过高导致过滤为空，已自动放宽为保留 TopK 结果`,
      })
    }
  }
  citations = clipContexts(citations)
  sse.send('citations', { items: citations, retrieveQuery })

  throwIfAborted()
  sse.send('status', { stage: 'generate' })
  const systemPrompt = withAnswerStyle((options.systemPrompt || '').trim() || RAG_SYSTEM_PROMPT, options.answerStyle)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildRagUserPrompt(
        options.question,
        citations.map((c) => `${c.docName}\n${c.content}`),
        history.length ? formatHistory(history) : undefined,
      ),
    },
  ]

  if (!env.llmApiKey) {
    const fallback = citations.length
      ? `（演示模式：未配置 LLM_API_KEY）\n\n检索查询：${retrieveQuery}\n\n最相关片段来自「${citations[0].docName}」：\n\n${citations[0].content.slice(0, 400)}`
      : '（演示模式：未配置 LLM_API_KEY，且知识库没有命中片段）请先上传文档并在 server/.env 填写密钥。'
    sse.send('token', { text: fallback })
    sse.send('done', { ok: true, mode: 'demo' })
    return
  }

  await chatStream({
    messages,
    temperature,
    signal,
    onToken: (text) => {
      throwIfAborted()
      sse.send('token', { text })
    },
  })
  sse.send('done', { ok: true, mode: 'rag' })
}
