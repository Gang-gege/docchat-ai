import { env } from '../config/env.js'
import { chatOnce } from '../lib/llm.js'
import type { ChatHistoryItem } from '../types/index.js'

const REWRITE_SYSTEM = `你是检索查询改写器。根据对话历史，把用户最新问题改写成一句独立、完整、适合向量检索的中文查询。
规则：
1. 只输出改写后的查询本身，不要解释。
2. 补全指代（如「它」「这个」）为具体对象。
3. 不要编造文档中不存在的专有名词；不确定时尽量保留原问题关键词。`

export async function rewriteQuery(question: string, history: ChatHistoryItem[] = [], temperature = 0) {
  if (!env.llmApiKey) return { query: question, rewritten: false }
  if (!history.length) return { query: question, rewritten: false }

  const recent = history.slice(-6)
  const transcript = recent.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 300)}`).join('\n')

  try {
    const res = await chatOnce({
      temperature,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        {
          role: 'user',
          content: `对话历史：\n${transcript}\n\n最新问题：${question}\n\n请输出改写后的检索查询：`,
        },
      ],
    })
    const query = (res.content || '').trim().replace(/^["「]|["」]$/g, '')
    if (!query || query.length > 200) return { query: question, rewritten: false }
    return { query, rewritten: query !== question }
  } catch {
    return { query: question, rewritten: false }
  }
}
