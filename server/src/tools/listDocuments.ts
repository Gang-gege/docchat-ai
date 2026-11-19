import { documentStore } from '../store/document-store.js'
import type { ToolDefinition } from '../types/index.js'

export const listDocumentsTool: ToolDefinition = {
  name: 'listDocuments',
  description: '列出当前知识库中已上传文档的名称、切片数与入库时间。用于回答「有哪些文档」「文档叫什么」等问题。',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute() {
    const list = documentStore.list().map((d) => ({
      docId: d.docId,
      name: d.name,
      chunkCount: d.chunkCount,
      createdAt: d.createdAt,
    }))
    return { total: list.length, documents: list }
  },
}
