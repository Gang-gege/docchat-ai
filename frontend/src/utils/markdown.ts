import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

export function renderMarkdown(text: string) {
  if (!text) return ''
  return marked.parse(text, { async: false }) as string
}

export const STAGE_LABEL: Record<string, string> = {
  agent: 'Agent 路由中…',
  rewrite: '查询改写中…',
  retrieve: '向量检索中…',
  generate: '生成回答中…',
}
