import { llmConfig } from '../config/runtime.js'

const DIM = 256

function tokenize(text: string) {
  const parts = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const tokens: string[] = []
  for (const part of parts) {
    const han = part.match(/[\u4e00-\u9fff]/g)
    if (han && han.length >= 2) {
      for (let i = 0; i < han.length - 1; i++) tokens.push(han[i] + han[i + 1])
    } else if (!han) {
      tokens.push(part)
    } else {
      tokens.push(han[0])
    }
  }
  return tokens
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
  const cfg = llmConfig()
  const base = cfg.embeddingBaseUrl.endsWith('/v1') ? cfg.embeddingBaseUrl : `${cfg.embeddingBaseUrl}/v1`
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.embeddingModel,
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
  const cfg = llmConfig()
  const useRemote = !cfg.useLocalEmbedding && Boolean(cfg.embeddingApiKey)
  if (useRemote) return remoteEmbed(texts)
  return texts.map(localEmbed)
}

export async function embedQuery(text: string) {
  const [vec] = await embedTexts([text])
  return vec
}

export function embeddingBackend() {
  const cfg = llmConfig()
  return !cfg.useLocalEmbedding && cfg.embeddingApiKey ? 'remote' : 'local'
}
