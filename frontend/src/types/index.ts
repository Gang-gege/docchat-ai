export interface DocItem {
  docId: string
  name: string
  ext: string
  size: number
  chunkCount: number
  createdAt: string
  storagePath?: string
  summary?: string
  note?: string
  favorite?: boolean
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  agentLogs?: AgentLog[]
  rewriteQuery?: string
  stage?: string
  streaming?: boolean
  createdAt?: string
}

export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
  archived?: boolean
  tags?: string[]
  docIds?: string[]
}

export interface PublicSettings {
  llmBaseUrl: string
  llmModel: string
  temperature: number
  topK: number
  chunkSize: number
  chunkOverlap: number
  maxContextChars?: number
  useLocalEmbedding?: boolean
  llmConfigured?: boolean
  defaultSystemPrompt?: string
}

export interface KnowledgeStats {
  docCount: number
  chunkCount: number
  totalSize: number
  avgChunks?: number
  vectorBackend: string
  db?: string
  dbPath?: string
  embedding: string
  llmConfigured: boolean
  llmModel: string
  chunkSize?: number
  chunkOverlap?: number
  recentDocs: Array<{ docId?: string; name: string; chunkCount: number; createdAt: string }>
  suggestions?: string[]
}

export interface ApiBody<T> {
  code: number
  msg: string
  data: T
}
