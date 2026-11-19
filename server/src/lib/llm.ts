import { env } from '../config/env.js'
import { llmConfig } from '../config/runtime.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

function chatUrl() {
  const { baseUrl } = llmConfig()
  const base = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`
  return `${base}/chat/completions`
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${llmConfig().apiKey}`,
  }
}

export async function chatOnce(params: {
  messages: ChatMessage[]
  temperature?: number
  tools?: ToolSpec[]
}) {
  if (!llmConfig().apiKey) {
    throw new Error('未配置 LLM_API_KEY，请在 server/.env 或「模型接入」中填写后重试')
  }
  const res = await fetch(chatUrl(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: llmConfig().model,
      temperature: params.temperature ?? env.llmTemperature,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools?.length ? 'auto' : undefined,
    }),
  })
  if (!res.ok) {
    throw new Error(`LLM 请求失败 ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null
        tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>
      }
    }>
  }
  const message = json.choices[0]?.message
  const toolCalls: ToolCall[] = (message?.tool_calls || []).map((c) => ({
    id: c.id,
    name: c.function.name,
    arguments: c.function.arguments,
  }))
  return {
    content: message?.content || '',
    toolCalls,
    rawToolCalls: message?.tool_calls || [],
  }
}

export async function chatStream(params: {
  messages: ChatMessage[]
  temperature?: number
  onToken: (text: string) => void
  signal?: AbortSignal
}) {
  if (!llmConfig().apiKey) {
    throw new Error('未配置 LLM_API_KEY，请在 server/.env 或「模型接入」中填写后重试')
  }
  const res = await fetch(chatUrl(), {
    method: 'POST',
    headers: headers(),
    signal: params.signal,
    body: JSON.stringify({
      model: llmConfig().model,
      temperature: params.temperature ?? env.llmTemperature,
      messages: params.messages,
      stream: true,
    }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`LLM 流式请求失败 ${res.status}: ${await res.text()}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    if (params.signal?.aborted) {
      await reader.cancel().catch(() => undefined)
      throw new Error('客户端已取消生成')
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const token = json.choices?.[0]?.delta?.content
        if (token) params.onToken(token)
      } catch {
        /* 忽略半包 */
      }
    }
  }
}
