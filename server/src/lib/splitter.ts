import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { env } from '../config/env.js'

export async function splitText(text: string) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: env.chunkSize,
    chunkOverlap: env.chunkOverlap,
    separators: ['\n\n', '\n', '。', '！', '？', '.', ' ', ''],
  })
  const docs = await splitter.createDocuments([text])
  return docs.map((d) => d.pageContent).filter((chunk) => chunk.trim().length > 0)
}
