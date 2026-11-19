import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../.env') })
dotenv.config({ path: path.resolve(here, '../../../.env') })

function num(value: string | undefined, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  port: num(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmBaseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  llmModel: process.env.LLM_MODEL || 'deepseek-chat',
  llmTemperature: num(process.env.LLM_TEMPERATURE, 0.2),
  embeddingApiKey: process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || '',
  embeddingBaseUrl: (process.env.EMBEDDING_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  ),
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  useLocalEmbedding: process.env.USE_LOCAL_EMBEDDING !== 'false',
  chromaUrl: process.env.CHROMA_URL || '',
  chromaCollection: process.env.CHROMA_COLLECTION || 'docchat',
  chunkSize: num(process.env.CHUNK_SIZE, 800),
  chunkOverlap: num(process.env.CHUNK_OVERLAP, 120),
  topK: num(process.env.TOP_K, 4),
  maxContextChars: num(process.env.MAX_CONTEXT_CHARS, 6000),
}

export function publicSettings() {
  return {
    llmBaseUrl: env.llmBaseUrl,
    llmModel: env.llmModel,
    temperature: env.llmTemperature,
    topK: env.topK,
    chunkSize: env.chunkSize,
    chunkOverlap: env.chunkOverlap,
    maxContextChars: env.maxContextChars,
    useLocalEmbedding: env.useLocalEmbedding,
    llmConfigured: Boolean(env.llmApiKey),
  }
}
