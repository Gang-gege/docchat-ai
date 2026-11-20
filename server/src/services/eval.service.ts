import { embedQuery } from '../lib/embeddings.js'
import { vectorStore } from '../store/vector-store.js'

export interface EvalInput {
  question: string
  expectDoc: string
}

function hitIndex(names: string[], contents: string[], expectDoc: string) {
  const needle = expectDoc.trim().toLowerCase()
  if (!needle) return -1
  return names.findIndex(
    (name, index) => name.toLowerCase().includes(needle) || contents[index].toLowerCase().includes(needle),
  )
}

export async function runEval(cases: EvalInput[], topK: number) {
  const rows = []
  for (const item of cases) {
    const hits = await vectorStore.search(await embedQuery(item.question), topK, undefined, item.question)
    const index = hitIndex(
      hits.map((hit) => hit.docName),
      hits.map((hit) => hit.content),
      item.expectDoc,
    )
    rows.push({
      question: item.question,
      expectDoc: item.expectDoc,
      hit: index >= 0,
      rank: index >= 0 ? index + 1 : null,
      topDoc: hits[0]?.docName || '',
      score: hits[0]?.score ?? 0,
      hits: hits.map((hit) => ({
        docName: hit.docName,
        score: hit.score,
        snippet: hit.content.replace(/\s+/g, ' ').slice(0, 90),
      })),
    })
  }
  const recalled = rows.filter((row) => row.hit).length
  const mrr = rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / (rows.length || 1)
  return {
    topK,
    total: rows.length,
    recall: rows.length ? recalled / rows.length : 0,
    mrr,
    rows,
  }
}
