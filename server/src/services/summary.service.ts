import { env } from '../config/env.js'
import { chatOnce } from '../lib/llm.js'
import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'

function excerptOf(docId: string) {
  return vectorStore
    .listByDoc(docId)
    .slice(0, 4)
    .map((item) => item.content.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1800)
}

/** 用文档前几段切片生成短摘要；没有密钥时退回原文摘录。 */
export async function summarizeDocument(docId: string) {
  const doc = documentStore.get(docId)
  if (!doc) return undefined
  const source = excerptOf(docId)
  if (!source) {
    return documentStore.saveSummary(docId, '这篇文档还没有可摘要的切片。')
  }
  if (!env.llmApiKey) {
    return documentStore.saveSummary(docId, `${source.slice(0, 160)}…`)
  }
  const result = await chatOnce({
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: '你是文档速记员。只根据给定片段写一段 80 到 140 字的中文摘要，不要编造片段里没有的事实。',
      },
      { role: 'user', content: `文档：${doc.name}\n\n${source}` },
    ],
  })
  const text = result.content.replace(/\s+/g, ' ').trim() || `${source.slice(0, 160)}…`
  return documentStore.saveSummary(docId, text)
}
