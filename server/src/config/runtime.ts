import { env } from './env.js'

export interface ActiveModel {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  chatModel: string
  embeddingModel: string
  embeddingBaseUrl: string
  useLocalEmbedding: boolean
}

let active: ActiveModel | null = null

export function setActiveModel(model: ActiveModel | null) {
  active = model
}

export function getActiveModel() {
  return active
}

/** 当前生效的模型连接。未单独保存密钥时回落到 server/.env。 */
export function llmConfig() {
  const key = active?.apiKey || env.llmApiKey
  const baseUrl = (active?.baseUrl || env.llmBaseUrl).replace(/\/$/, '')
  const embeddingBase = (active?.embeddingBaseUrl || env.embeddingBaseUrl).replace(/\/$/, '')
  return {
    apiKey: key,
    baseUrl,
    model: active?.chatModel || env.llmModel,
    embeddingModel: active?.embeddingModel || env.embeddingModel,
    embeddingBaseUrl: embeddingBase,
    embeddingApiKey: active?.apiKey || env.embeddingApiKey || env.llmApiKey,
    useLocalEmbedding: active ? active.useLocalEmbedding : env.useLocalEmbedding,
    profileName: active?.name || '环境变量',
  }
}
