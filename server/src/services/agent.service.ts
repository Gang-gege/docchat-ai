import { chatOnce, chatStream, type ChatMessage } from '../lib/llm.js'
import { listToolSpecs, runTool } from '../tools/index.js'
import type { AgentLog, ChatHistoryItem } from '../types/index.js'

const AGENT_SYSTEM = `你是 DocChat 的工具路由助手。
可调用工具：
- getCurrentTime：当前时间
- getDocCount：文档数 / 切片数
- listDocuments：列出文档清单（有哪些文件）
- searchKnowledge：仅当用户给出很短、明确的关键词要「原文里搜这个词」时使用

必须回复 NEED_RAG（不要调用任何工具）的情况：
- 「某某 PDF / 文档讲了什么、主要内容、总结、介绍」
- 「根据文档解释 / 说明 / 如何操作」
- 任何需要理解、归纳文档语义的问题

规则：
1. 问「有哪些文档」→ listDocuments；问时间 → getCurrentTime；问数量 → getDocCount。
2. 问文档内容 / 主题 / 总结 → 直接 NEED_RAG，禁止 searchKnowledge。
3. 工具失败时不要编造结果。
4. 最终回答用简洁中文，可用 Markdown，不要输出 JSON。`

function shouldFallbackToRag(logs: AgentLog[]) {
  const searchLogs = logs.filter((l) => l.tool === 'searchKnowledge')
  if (!searchLogs.length) return false
  // 关键词搜空结果：交给向量 RAG，而不是让模型说「没有」
  return searchLogs.every((l) => {
    const out = l.output as { hitCount?: number } | undefined
    return !out || Number(out.hitCount || 0) === 0
  })
}

function formatToolFallback(logs: AgentLog[]) {
  const withOutput = logs.filter((l) => l.tool && l.output != null)
  if (!withOutput.length) return ''
  const lines = withOutput.map((l) => {
    if (l.tool === 'listDocuments') {
      const data = l.output as { total?: number; documents?: Array<{ name: string; chunkCount: number }> }
      const docs = data.documents || []
      if (!docs.length) return '当前知识库没有文档。'
      const rows = docs.map((d, i) => `| ${i + 1} | ${d.name} | ${d.chunkCount} |`).join('\n')
      return `当前知识库共有 **${data.total ?? docs.length}** 篇文档：\n\n| # | 文档名称 | 切片数 |\n| --- | --- | --- |\n${rows}`
    }
    if (l.tool === 'getDocCount') {
      const data = l.output as { docCount?: number; chunkCount?: number }
      return `知识库文档数：**${data.docCount ?? 0}**，向量切片数：**${data.chunkCount ?? 0}**。`
    }
    if (l.tool === 'getCurrentTime') {
      const data = l.output as { local?: string; iso?: string }
      return `当前时间：**${data.local || data.iso}**`
    }
    return `已获取工具结果，请查看下方过程摘要。`
  })
  return lines.join('\n\n')
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/** 把整段文字拆成小片推送，模拟打字机（用于工具直出兜底） */
export async function emitTypedText(
  text: string,
  onToken: (t: string) => void,
  signal?: AbortSignal,
) {
  const step = 2
  for (let i = 0; i < text.length; i += step) {
    if (signal?.aborted) throw new Error('客户端已取消生成')
    onToken(text.slice(i, i + step))
    await sleep(16)
  }
}

function isDocContentQuestion(question: string) {
  return /(讲了?什么|主要(内容|讲解|讲了)|总结|概括|介绍|内容是什么|讲解了哪些|说明了什么|讲了哪些)/.test(
    question,
  )
}

export async function maybeRunAgent(
  question: string,
  temperature?: number,
  history: ChatHistoryItem[] = [],
  onToken?: (text: string) => void,
  signal?: AbortSignal,
) {
  const logs: AgentLog[] = []
  try {
    // 硬规则：问文档「讲什么」直接走 RAG，不交给模型乱调 searchKnowledge
    if (isDocContentQuestion(question)) {
      logs.push({ thought: '识别为文档内容问答，跳过 Agent，直接向量 RAG' })
      return { logs, usedTools: false, streamed: false, directAnswer: '' }
    }

    const historyMsgs: ChatMessage[] = history.slice(-4).map((h) => ({
      role: h.role,
      content: h.content.slice(0, 400),
    }))

    const first = await chatOnce({
      temperature,
      tools: listToolSpecs(),
      messages: [
        { role: 'system', content: AGENT_SYSTEM },
        ...historyMsgs,
        { role: 'user', content: question },
      ],
    })

    if (!first.toolCalls.length) {
      const skip = /NEED_RAG/i.test(first.content) || !first.content
      logs.push({
        thought: skip ? '无需调用工具，转入 RAG 检索' : first.content.slice(0, 200),
      })
      return { logs, usedTools: false, streamed: false, directAnswer: skip ? '' : first.content }
    }

    const follow: ChatMessage[] = [
      { role: 'system', content: AGENT_SYSTEM },
      ...historyMsgs,
      { role: 'user', content: question },
      {
        role: 'assistant',
        content: first.content || null,
        tool_calls: first.rawToolCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.function.name, arguments: c.function.arguments },
        })),
      },
    ]

    for (const call of first.toolCalls) {
      try {
        const output = await runTool(call.name, call.arguments)
        logs.push({
          thought: `调用工具 ${call.name}`,
          tool: call.name,
          input: safeParse(call.arguments),
          output,
        })
        follow.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(output),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logs.push({ thought: '工具调用失败，回退 RAG', tool: call.name, input: call.arguments, output: msg })
        return { logs, usedTools: false, streamed: false, directAnswer: '' }
      }
    }

    if (shouldFallbackToRag(logs)) {
      logs.push({ thought: '关键词检索无命中，回退向量 RAG 做语义检索' })
      return { logs, usedTools: false, streamed: false, directAnswer: '' }
    }

    try {
      if (onToken) {
        await chatStream({
          temperature,
          messages: follow,
          signal,
          onToken,
        })
        return { logs, usedTools: true, streamed: true, directAnswer: '' }
      }
      const second = await chatOnce({ temperature, messages: follow })
      return {
        logs,
        usedTools: true,
        streamed: false,
        directAnswer: second.content || formatToolFallback(logs),
      }
    } catch (err) {
      const fallback = formatToolFallback(logs)
      logs.push({
        thought: `二次生成失败，使用工具结果直出：${err instanceof Error ? err.message : String(err)}`,
      })
      if (onToken && fallback) {
        await emitTypedText(fallback, onToken, signal)
        return { logs, usedTools: true, streamed: true, directAnswer: '' }
      }
      return { logs, usedTools: true, streamed: false, directAnswer: fallback }
    }
  } catch (err) {
    logs.push({
      thought: `Agent 异常，回退 RAG：${err instanceof Error ? err.message : String(err)}`,
    })
    return { logs, usedTools: false, streamed: false, directAnswer: '' }
  }
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return raw
  }
}
