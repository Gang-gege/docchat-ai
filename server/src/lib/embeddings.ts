import { env } from '../config/env.js'

const DIM = 256

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** 开发兜底：字符哈希袋，保证入库与检索同一空间。正式环境请关闭 USE_LOCAL_EMBEDDING。 */
export function localEmbed(text: string) {
  const vec = new Array(DIM).fill(0)
  const tokens = tokenize(text)
  if (!tokens.length) {
    for (let i = 0; i < Math.min(text.length, DIM); i++) {
      vec[i % DIM] += text.charCodeAt(i) / 1000
    }
  }
  for (const token of tokens) {
    let h = 0
    for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0
    vec[h % DIM] += 1
    if (token.length >= 2) {
      let h2 = 0
      for (let i = 0; i < token.length - 1; i++) {
        h2 = (h2 * 31 + token.charCodeAt(i) + token.charCodeAt(i + 1)) >>> 0
      }
      vec[h2 % DIM] += 0.5
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

async function remoteEmbed(texts: string[]) {
  const base = env.embeddingBaseUrl.endsWith('/v1') ? env.embeddingBaseUrl : `${env.embeddingBaseUrl}/v1`
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: env.embeddingModel,
      input: texts,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Embedding 请求失败 ${res.status}: ${body}`)
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data.map((item) => item.embedding)
}

export async function embedTexts(texts: string[]) {
  if (!texts.length) return []
  const useRemote = !env.useLocalEmbedding && Boolean(env.embeddingApiKey)
  if (useRemote) return remoteEmbed(texts)
  return texts.map(localEmbed)
}

export async function embedQuery(text: string) {
  const [vec] = await embedTexts([text])
  return vec
}

export function embeddingBackend() {
  return !env.useLocalEmbedding && env.embeddingApiKey ? 'remote' : 'local'
}
