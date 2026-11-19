export interface DocMeta {
  docId: string
  name: string
  ext: string
  size: number
  chunkCount: number
  createdAt: string
  storagePath?: string
}

export interface VectorChunk {
  id: string
  docId: string
  docName: string
  content: string
  embedding: number[]
}

export interface Citation {
  docId: string
  docName: string
  content: string
  score: number
}

export interface AgentLog {
  thought: string
  tool?: string
  input?: unknown
  output?: unknown
}

export interface ApiBody<T = unknown> {
  code: number
  msg: string
  data: T | null
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRuntimeOptions {
  question: string
  topK?: number
  temperature?: number
  enableAgent?: boolean
  history?: ChatHistoryItem[]
  enableRewrite?: boolean
  scoreThreshold?: number
  /** 前端可覆盖的系统提示词 */
  systemPrompt?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown
}
