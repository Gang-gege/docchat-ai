import type { ToolSpec } from '../lib/llm.js'
import type { ToolDefinition } from '../types/index.js'
import { getCurrentTimeTool } from './getCurrentTime.js'
import { getDocCountTool } from './getDocCount.js'
import { listDocumentsTool } from './listDocuments.js'
import { searchKnowledgeTool } from './searchKnowledge.js'

const tools: ToolDefinition[] = [getCurrentTimeTool, getDocCountTool, listDocumentsTool, searchKnowledgeTool]
const map = new Map(tools.map((t) => [t.name, t]))

export function listToolSpecs(): ToolSpec[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export async function runTool(name: string, rawArgs: string) {
  const tool = map.get(name)
  if (!tool) throw new Error(`未知工具: ${name}`)
  let args: Record<string, unknown> = {}
  const cleaned = rawArgs.trim().replace(/^```json\s*|\s*```$/g, '')
  if (cleaned) {
    try {
      args = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      throw new Error(`工具 ${name} 参数不是合法 JSON`)
    }
  }
  return tool.execute(args)
}
