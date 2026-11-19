import { embedQuery } from '../lib/embeddings.js'
import { chatOnce } from '../lib/llm.js'
import { libraryStore, type WorkflowStep } from '../store/library-store.js'
import { vectorStore } from '../store/vector-store.js'

export interface WorkflowLog {
  type: WorkflowStep['type']
  output: string
}

async function ask(system: string, user: string) {
  const result = await chatOnce({
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user.slice(0, 6000) },
    ],
  })
  return result.content.trim()
}

export async function runWorkflow(steps: WorkflowStep[], seed: string) {
  let context = seed.trim()
  const logs: WorkflowLog[] = []
  for (const step of steps) {
    if (step.type === 'search') {
      const query = (step.input || context).trim()
      const hits = await vectorStore.search(await embedQuery(query), 4, step.docIds)
      context = hits.length
        ? hits.map((hit, index) => `[${index + 1}] ${hit.docName}\n${hit.content}`).join('\n\n')
        : '没有召回到文档片段。'
      logs.push({ type: step.type, output: context.slice(0, 800) })
      continue
    }
    const instruction =
      step.type === 'extract'
        ? libraryStore.promptByKind('extract') || '提取关键信息，用列表输出。'
        : step.type === 'compare'
          ? '对比材料中的异同，先写结论，再列差异。'
          : libraryStore.promptByKind('summary') || '请概括下面的材料。'
    const extra = step.input ? `\n补充要求：${step.input}` : ''
    context = await ask(instruction, `${context}${extra}`)
    logs.push({ type: step.type, output: context.slice(0, 800) })
  }
  return { answer: context, logs }
}
