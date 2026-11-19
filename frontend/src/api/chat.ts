import type { AgentLog, Citation } from '../types'

export interface StreamHandlers {
  onStatus?: (stage: string) => void
  onRewrite?: (payload: { original: string; query: string }) => void
  onCitations?: (items: Citation[], retrieveQuery?: string) => void
  onAgent?: (log: AgentLog) => void
  onToken?: (text: string) => void
  onDone?: () => void
  onError?: (msg: string) => void
}

export interface ChatStreamParams {
  question: string
  topK: number
  temperature: number
  enableAgent: boolean
  enableRewrite: boolean
  scoreThreshold: number
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  systemPrompt?: string
}

function dispatchEvent(event: string, data: unknown, handlers: StreamHandlers) {
  if (event === 'status') handlers.onStatus?.((data as { stage: string }).stage)
  else if (event === 'rewrite') handlers.onRewrite?.(data as { original: string; query: string })
  else if (event === 'citations') {
    const payload = data as { items: Citation[]; retrieveQuery?: string }
    handlers.onCitations?.(payload.items || [], payload.retrieveQuery)
  } else if (event === 'agent') handlers.onAgent?.(data as AgentLog)
  else if (event === 'token') handlers.onToken?.((data as { text: string }).text || '')
  else if (event === 'done') handlers.onDone?.()
  else if (event === 'error') handlers.onError?.((data as { msg: string }).msg || '问答失败')
}

/** POST + fetch 流式，支持多轮 history 与 AbortController 停止生成 */
export function openChatStream(params: ChatStreamParams, handlers: StreamHandlers) {
  const controller = new AbortController()
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    controller.abort()
  }

  void (async () => {
    try {
      const res = await fetch('/api/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(params),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const text = await res.text()
        handlers.onError?.(text || `请求失败 ${res.status}`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = 'message'

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n')
        buffer = chunks.pop() || ''

        for (const rawLine of chunks) {
          const line = rawLine.replace(/\r$/, '')
          if (!line) {
            eventName = 'message'
            continue
          }
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
            continue
          }
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          try {
            const data = JSON.parse(payload) as unknown
            dispatchEvent(eventName, data, handlers)
            if (eventName === 'done' || eventName === 'error') {
              finished = true
              return
            }
          } catch {
            /* ignore bad frame */
          }
        }
      }
      if (!finished) handlers.onDone?.()
    } catch (err) {
      if (controller.signal.aborted) {
        handlers.onError?.('已停止生成')
        return
      }
      handlers.onError?.(err instanceof Error ? err.message : '流式连接中断')
    } finally {
      finished = true
    }
  })()

  return () => finish()
}
