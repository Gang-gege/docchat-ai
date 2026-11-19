import { documentStore } from '../store/document-store.js'
import { vectorStore } from '../store/vector-store.js'
import type { ToolDefinition } from '../types/index.js'

export const getDocCountTool: ToolDefinition = {
  name: 'getDocCount',
  description: '获取当前知识库已上传文档数量以及向量切片数量。',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute() {
    return {
      docCount: documentStore.count(),
      chunkCount: vectorStore.chunkCount(),
    }
  },
}
