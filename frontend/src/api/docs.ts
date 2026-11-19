import { http } from './http'
import type { ApiBody, DocItem, KnowledgeStats, PublicSettings } from '../types'

export function fetchHealth() {
  return http.get<ApiBody<{ ok: boolean; vectorBackend: string; embedding: string }>>('/health')
}

export function fetchSettings() {
  return http.get<ApiBody<PublicSettings>>('/settings')
}

export function fetchDocs(q = '') {
  return http.get<ApiBody<{ list: DocItem[]; total: number }>>('/docs', { params: { q: q || undefined } })
}

export function fetchDocDetail(docId: string) {
  return http.get<
    ApiBody<{
      doc: DocItem & { storagePath?: string }
      chunks: Array<{ id: string; docId: string; docName: string; content: string; preview: string }>
      hasFile: boolean
    }>
  >(`/doc/${docId}`)
}

export function downloadDoc(docId: string, name: string) {
  return http
    .get(`/doc/${docId}/download`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    })
}

export function reindexDoc(docId: string) {
  return http.post<ApiBody<{ doc: DocItem }>>(`/doc/${docId}/reindex`)
}

export function searchChunks(keyword: string) {
  return http.get<ApiBody<{ keyword: string; hits: Array<{ docId: string; docName: string; content: string }> }>>(
    '/search',
    { params: { keyword } },
  )
}

export function uploadDocs(files: File[]) {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  return http.post<ApiBody<{ docs: DocItem[]; docId: string }>>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteDoc(docId: string) {
  return http.delete<ApiBody<{ docId: string }>>(`/doc/${docId}`)
}

export function batchDeleteDocs(docIds: string[]) {
  return http.post<ApiBody<{ removed: string[]; count: number }>>('/docs/batch-delete', { docIds })
}

export function clearKnowledgeBase() {
  return http.post<ApiBody<{ removedDocs: number }>>('/docs/clear')
}

export function fetchStats() {
  return http.get<ApiBody<KnowledgeStats>>('/stats')
}
