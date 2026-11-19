import { nanoid } from 'nanoid'
import { getDb, persistDb } from '../db/index.js'
import { setActiveModel, type ActiveModel } from '../config/runtime.js'

export interface ModelProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  chatModel: string
  embeddingModel: string
  embeddingBaseUrl: string
  useLocalEmbedding: boolean
  active: boolean
}

export interface PromptTemplate {
  id: string
  name: string
  kind: 'qa' | 'summary' | 'extract'
  content: string
  builtin: boolean
}

export interface WorkflowRecord {
  id: string
  name: string
  steps: WorkflowStep[]
  updatedAt: string
}

export interface WorkflowStep {
  type: 'search' | 'summarize' | 'extract' | 'compare'
  input?: string
  docIds?: string[]
}

export interface EvalCase {
  id: string
  question: string
  expectDoc: string
}

const BUILTIN_PROMPTS: Array<Omit<PromptTemplate, 'id' | 'builtin'>> = [
  {
    name: '问答默认',
    kind: 'qa',
    content:
      '你是企业私有文档问答助手。只能依据参考上下文回答；没有依据时说明未找到，不要编造。引用片段用 [1]、[2] 标注。',
  },
  {
    name: '摘要默认',
    kind: 'summary',
    content: '你是文档速记员。只根据给定片段写 80 到 140 字中文摘要，不要补充片段里没有的事实。',
  },
  {
    name: '信息提取',
    kind: 'extract',
    content: '从材料中提取关键字段，用 Markdown 列表输出。没有的字段写「未提及」，不要猜测。',
  },
]

function maskKey(key: string) {
  if (!key) return ''
  if (key.length <= 4) return '****'
  return `${key.slice(0, 3)}****${key.slice(-4)}`
}

export function toPublicModel(row: ModelProfile) {
  return {
    ...row,
    apiKey: maskKey(row.apiKey),
    hasKey: Boolean(row.apiKey),
  }
}

function applyActive(row: ModelProfile | undefined) {
  if (!row) {
    setActiveModel(null)
    return
  }
  const model: ActiveModel = {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    chatModel: row.chatModel,
    embeddingModel: row.embeddingModel,
    embeddingBaseUrl: row.embeddingBaseUrl,
    useLocalEmbedding: row.useLocalEmbedding,
  }
  setActiveModel(model)
}

export function ensureLibrary() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      chat_model TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_base_url TEXT NOT NULL DEFAULT '',
      use_local_embedding INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      builtin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      steps TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eval_cases (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      expect_doc TEXT NOT NULL DEFAULT ''
    );
  `)
  const countStmt = db.prepare('SELECT COUNT(*) as c FROM prompt_templates')
  countStmt.step()
  const count = Number((countStmt.getAsObject() as { c: number }).c || 0)
  countStmt.free()
  if (!count) {
    const insert = db.prepare(
      'INSERT INTO prompt_templates (id, name, kind, content, builtin) VALUES (?, ?, ?, ?, 1)',
    )
    for (const item of BUILTIN_PROMPTS) {
      insert.run([`p_${nanoid(6)}`, item.name, item.kind, item.content])
    }
    insert.free()
  }
  persistDb()
  applyActive(libraryStore.activeModel())
}

function mapModel(row: Record<string, unknown>): ModelProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    baseUrl: String(row.base_url),
    apiKey: String(row.api_key || ''),
    chatModel: String(row.chat_model),
    embeddingModel: String(row.embedding_model),
    embeddingBaseUrl: String(row.embedding_base_url || ''),
    useLocalEmbedding: Number(row.use_local_embedding) === 1,
    active: Number(row.active) === 1,
  }
}

export const libraryStore = {
  listModels() {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM model_profiles ORDER BY name')
    const rows: ModelProfile[] = []
    while (stmt.step()) rows.push(mapModel(stmt.getAsObject()))
    stmt.free()
    return rows
  },
  activeModel() {
    return this.listModels().find((item) => item.active)
  },
  saveModel(input: Partial<ModelProfile> & { name: string }) {
    const db = getDb()
    const id = input.id || `m_${nanoid(6)}`
    const prev = this.listModels().find((item) => item.id === id)
    const apiKey = input.apiKey && !input.apiKey.includes('****') ? input.apiKey : prev?.apiKey || ''
    db.run(
      `INSERT INTO model_profiles
        (id, name, base_url, api_key, chat_model, embedding_model, embedding_base_url, use_local_embedding, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         base_url=excluded.base_url,
         api_key=excluded.api_key,
         chat_model=excluded.chat_model,
         embedding_model=excluded.embedding_model,
         embedding_base_url=excluded.embedding_base_url,
         use_local_embedding=excluded.use_local_embedding`,
      [
        id,
        input.name,
        input.baseUrl || 'https://api.deepseek.com',
        apiKey,
        input.chatModel || 'deepseek-chat',
        input.embeddingModel || 'text-embedding-3-small',
        input.embeddingBaseUrl || input.baseUrl || 'https://api.deepseek.com',
        input.useLocalEmbedding === false ? 0 : 1,
        prev?.active ? 1 : 0,
      ],
    )
    persistDb()
    return this.listModels().find((item) => item.id === id)
  },
  activateModel(id: string) {
    const db = getDb()
    db.run('UPDATE model_profiles SET active = 0')
    db.run('UPDATE model_profiles SET active = 1 WHERE id = ?', [id])
    persistDb()
    applyActive(this.activeModel())
    return this.activeModel()
  },
  clearActiveModel() {
    const db = getDb()
    db.run('UPDATE model_profiles SET active = 0')
    persistDb()
    applyActive(undefined)
  },
  removeModel(id: string) {
    const db = getDb()
    const wasActive = this.activeModel()?.id === id
    db.run('DELETE FROM model_profiles WHERE id = ?', [id])
    persistDb()
    if (wasActive) applyActive(undefined)
  },
  listPrompts() {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM prompt_templates ORDER BY builtin DESC, name')
    const rows: PromptTemplate[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const kind = String(row.kind)
      rows.push({
        id: String(row.id),
        name: String(row.name),
        kind: kind === 'summary' || kind === 'extract' ? kind : 'qa',
        content: String(row.content),
        builtin: Number(row.builtin) === 1,
      })
    }
    stmt.free()
    return rows
  },
  promptByKind(kind: PromptTemplate['kind']) {
    return this.listPrompts().find((item) => item.kind === kind)?.content
  },
  savePrompt(input: Partial<PromptTemplate> & { name: string; kind: PromptTemplate['kind']; content: string }) {
    const db = getDb()
    const id = input.id || `p_${nanoid(6)}`
    db.run(
      `INSERT INTO prompt_templates (id, name, kind, content, builtin)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, content=excluded.content`,
      [id, input.name.slice(0, 40), input.kind, input.content.slice(0, 4000)],
    )
    persistDb()
    return this.listPrompts().find((item) => item.id === id)
  },
  removePrompt(id: string) {
    const db = getDb()
    db.run('DELETE FROM prompt_templates WHERE id = ? AND builtin = 0', [id])
    persistDb()
  },
  listWorkflows(): WorkflowRecord[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC')
    const rows: WorkflowRecord[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      let steps: WorkflowStep[] = []
      try {
        steps = JSON.parse(String(row.steps || '[]')) as WorkflowStep[]
      } catch {
        steps = []
      }
      rows.push({
        id: String(row.id),
        name: String(row.name),
        steps,
        updatedAt: String(row.updated_at),
      })
    }
    stmt.free()
    return rows
  },
  saveWorkflow(input: { id?: string; name: string; steps: WorkflowStep[] }) {
    const db = getDb()
    const id = input.id || `w_${nanoid(6)}`
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO workflows (id, name, steps, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, steps=excluded.steps, updated_at=excluded.updated_at`,
      [id, input.name.slice(0, 40), JSON.stringify(input.steps.slice(0, 8)), now],
    )
    persistDb()
    return this.listWorkflows().find((item) => item.id === id)
  },
  removeWorkflow(id: string) {
    const db = getDb()
    db.run('DELETE FROM workflows WHERE id = ?', [id])
    persistDb()
  },
  listCases(): EvalCase[] {
    const db = getDb()
    const stmt = db.prepare('SELECT * FROM eval_cases ORDER BY id DESC')
    const rows: EvalCase[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      rows.push({ id: String(row.id), question: String(row.question), expectDoc: String(row.expect_doc || '') })
    }
    stmt.free()
    return rows
  },
  replaceCases(cases: Array<{ question: string; expectDoc: string }>) {
    const db = getDb()
    db.run('DELETE FROM eval_cases')
    const insert = db.prepare('INSERT INTO eval_cases (id, question, expect_doc) VALUES (?, ?, ?)')
    for (const item of cases.slice(0, 50)) {
      if (!item.question?.trim()) continue
      insert.run([`e_${nanoid(6)}`, item.question.trim().slice(0, 300), (item.expectDoc || '').trim().slice(0, 120)])
    }
    insert.free()
    persistDb()
    return this.listCases()
  },
}
