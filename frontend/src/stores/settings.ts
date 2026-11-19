import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchSettings } from '../api/docs'
import { DEFAULT_SYSTEM_PROMPT } from '../constants/prompts'

const KEY = 'docchat-settings'

export const useSettingsStore = defineStore('settings', () => {
  const llmBaseUrl = ref('')
  const llmModel = ref('')
  const temperature = ref(0.2)
  const topK = ref(4)
  const enableAgent = ref(true)
  const enableRewrite = ref(true)
  const enableMultiTurn = ref(true)
  const scoreThreshold = ref(0.08)
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT)
  const chunkSize = ref(800)
  const chunkOverlap = ref(120)

  function persist() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        llmBaseUrl: llmBaseUrl.value,
        llmModel: llmModel.value,
        temperature: temperature.value,
        topK: topK.value,
        enableAgent: enableAgent.value,
        enableRewrite: enableRewrite.value,
        enableMultiTurn: enableMultiTurn.value,
        scoreThreshold: scoreThreshold.value,
        systemPrompt: systemPrompt.value,
      }),
    )
  }

  function loadLocal() {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    try {
      const data = JSON.parse(raw) as Record<string, unknown>
      if (typeof data.llmBaseUrl === 'string') llmBaseUrl.value = data.llmBaseUrl
      if (typeof data.llmModel === 'string') llmModel.value = data.llmModel
      if (typeof data.temperature === 'number') temperature.value = data.temperature
      if (typeof data.topK === 'number') topK.value = data.topK
      if (typeof data.enableAgent === 'boolean') enableAgent.value = data.enableAgent
      if (typeof data.enableRewrite === 'boolean') enableRewrite.value = data.enableRewrite
      if (typeof data.enableMultiTurn === 'boolean') enableMultiTurn.value = data.enableMultiTurn
      if (typeof data.scoreThreshold === 'number') scoreThreshold.value = data.scoreThreshold
      if (typeof data.systemPrompt === 'string' && data.systemPrompt.trim()) systemPrompt.value = data.systemPrompt
    } catch {
      /* ignore */
    }
  }

  async function hydrate() {
    loadLocal()
    const res = await fetchSettings()
    const remote = res.data.data
    if (!llmBaseUrl.value) llmBaseUrl.value = remote.llmBaseUrl
    if (!llmModel.value) llmModel.value = remote.llmModel
    chunkSize.value = remote.chunkSize
    chunkOverlap.value = remote.chunkOverlap
    if (!systemPrompt.value?.trim() && remote.defaultSystemPrompt) {
      systemPrompt.value = remote.defaultSystemPrompt
    }
    persist()
  }

  function resetSystemPrompt(defaultText?: string) {
    systemPrompt.value = defaultText || DEFAULT_SYSTEM_PROMPT
    persist()
  }

  return {
    llmBaseUrl,
    llmModel,
    temperature,
    topK,
    enableAgent,
    enableRewrite,
    enableMultiTurn,
    scoreThreshold,
    systemPrompt,
    chunkSize,
    chunkOverlap,
    persist,
    hydrate,
    resetSystemPrompt,
  }
})
