import type { ToolDefinition } from '../types/index.js'

export const getCurrentTimeTool: ToolDefinition = {
  name: 'getCurrentTime',
  description: '获取服务器当前时间，用于回答“现在几点”等时间类问题。',
  parameters: {
    type: 'object',
    properties: {
      timeZone: { type: 'string', description: '可选 IANA 时区，默认 Asia/Shanghai' },
    },
  },
  execute(args) {
    const timeZone = typeof args.timeZone === 'string' ? args.timeZone : 'Asia/Shanghai'
    const now = new Date()
    return {
      iso: now.toISOString(),
      local: now.toLocaleString('zh-CN', { timeZone, hour12: false }),
      timeZone,
    }
  },
}
