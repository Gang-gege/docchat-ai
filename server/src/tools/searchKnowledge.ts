import { vectorStore } from '../store/vector-store.js'
import type { ToolDefinition } from '../types/index.js'

export const searchKnowledgeTool: ToolDefinition = {
  name: 'searchKnowledge',
  description:
    '在知识库切片中按关键词做快速检索，返回匹配片段摘要。适合用户明确给出关键词、想快速定位文档内容时使用。复杂语义问答请不要用此工具（应走 RAG）。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '要搜索的关键词' },
      limit: { type: 'number', description: '返回条数，默认 5' },
    },
    required: ['keyword'],
  },
  execute(args) {
    const keyword = String(args.keyword || '').trim()
    if (!keyword) throw new Error('keyword 不能为空')
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 10) : 5
    const hits = vectorStore.keywordSearch(keyword, limit)
    return { keyword, hitCount: hits.length, hits }
  },
}
