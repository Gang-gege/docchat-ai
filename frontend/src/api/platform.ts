import { http } from './http'
import type { ApiBody, DocItem } from '../types'

export interface ModelProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  hasKey: boolean
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

export interface WorkflowStep {
  type: 'search' | 'summarize' | 'extract' | 'compare'
  input?: string
}

export interface WorkflowItem {
  id: string
  name: string
  steps: WorkflowStep[]
  updatedAt: string
}

export function fetchModels() {
  return http.get<ApiBody<{ list: ModelProfile[]; activeId: string; using: string }>>('/models')
}

export function saveModel(body: Partial<ModelProfile> & { name: string }) {
  return http.post<ApiBody<{ model: ModelProfile }>>('/models', body)
}

export function activateModel(id: string) {
  return http.post<ApiBody<{ model: ModelProfile }>>(`/models/${id}/activate`)
}

export function useEnvModel() {
  return http.post<ApiBody<{ using: string }>>('/models/use-env')
}

export function deleteModel(id: string) {
  return http.delete<ApiBody<{ id: string }>>(`/models/${id}`)
}

export function fetchPrompts() {
  return http.get<ApiBody<{ list: PromptTemplate[] }>>('/prompts')
}

export function savePrompt(body: Partial<PromptTemplate> & { name: string; kind: PromptTemplate['kind']; content: string }) {
  return http.post<ApiBody<{ prompt: PromptTemplate }>>('/prompts', body)
}

export function deletePrompt(id: string) {
  return http.delete<ApiBody<{ id: string }>>(`/prompts/${id}`)
}

export function vectorSearch(query: string, topK: number) {
  return http.post<
    ApiBody<{ query: string; topK: number; hits: Array<{ docId: string; docName: string; content: string; score: number }> }>
  >('/vector-search', { query, topK })
}

export function ingestUrl(url: string) {
  return http.post<ApiBody<{ doc: DocItem }>>('/ingest-url', { url })
}

export function batchReindex(docIds: string[]) {
  return http.post<ApiBody<{ docs: DocItem[]; errors: string[] }>>('/docs/batch-reindex', { docIds })
}

export function batchSummarize(docIds: string[]) {
  return http.post<ApiBody<{ docs: DocItem[]; count: number }>>('/docs/batch-summary', { docIds })
}

export function fetchEvalCases() {
  return http.get<ApiBody<{ list: Array<{ id: string; question: string; expectDoc: string }> }>>('/eval/cases')
}

export function saveEvalCases(cases: Array<{ question: string; expectDoc: string }>) {
  return http.post('/eval/cases', { cases })
}

export function runEval(topK: number) {
  return http.post<
    ApiBody<{
      topK: number
      total: number
      recall: number
      mrr: number
      rows: Array<{ question: string; expectDoc: string; hit: boolean; rank: number | null; topDoc: string; score: number }>
    }>
  >('/eval/run', { topK })
}

export function fetchWorkflows() {
  return http.get<ApiBody<{ list: WorkflowItem[] }>>('/workflows')
}

export function saveWorkflow(body: { id?: string; name: string; steps: WorkflowStep[] }) {
  return http.post<ApiBody<{ workflow: WorkflowItem }>>('/workflows', body)
}

export function deleteWorkflow(id: string) {
  return http.delete(`/workflows/${id}`)
}

export function runWorkflow(body: { steps: WorkflowStep[]; input: string }) {
  return http.post<ApiBody<{ answer: string; logs: Array<{ type: string; output: string }> }>>('/workflows/run', body)
}

export function fetchBackupInfo() {
  return http.get<ApiBody<{ path: string; bytes: number; engine: string }>>('/backup/info')
}

export function importBackup(file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<ApiBody<{ bytes: number }>>('/backup/import', form)
}
