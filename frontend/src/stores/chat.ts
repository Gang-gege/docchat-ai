import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChatMessage, ChatSession } from '../types'

const KEY = 'docchat-sessions-v2'

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function emptySession(): ChatSession {
  return {
    id: uid(),
    title: '新对话',
    updatedAt: new Date().toISOString(),
    messages: [],
  }
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeId = ref('')

  const activeSession = computed(() => sessions.value.find((s) => s.id === activeId.value) || null)
  const messages = computed(() => activeSession.value?.messages || [])

  function persist() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        activeId: activeId.value,
        sessions: sessions.value.map((s) => ({
          ...s,
          messages: s.messages.map((m) => ({ ...m, streaming: false, stage: undefined })),
        })),
      }),
    )
  }

  function load() {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      const s = emptySession()
      sessions.value = [s]
      activeId.value = s.id
      persist()
      return
    }
    try {
      const data = JSON.parse(raw) as { activeId?: string; sessions?: ChatSession[] }
      sessions.value = data.sessions?.length ? data.sessions : [emptySession()]
      activeId.value = data.activeId && sessions.value.some((s) => s.id === data.activeId) ? data.activeId : sessions.value[0].id
    } catch {
      const s = emptySession()
      sessions.value = [s]
      activeId.value = s.id
    }
  }

  function createSession() {
    const s = emptySession()
    sessions.value.unshift(s)
    activeId.value = s.id
    persist()
    return s
  }

  function renameSession(id: string, title: string) {
    const s = sessions.value.find((item) => item.id === id)
    if (!s) return
    s.title = title.trim().slice(0, 40) || '新对话'
    s.updatedAt = new Date().toISOString()
    persist()
  }

  function selectSession(id: string) {
    if (!sessions.value.some((s) => s.id === id)) return
    activeId.value = id
    persist()
  }

  function removeSession(id: string) {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx < 0) return
    sessions.value.splice(idx, 1)
    if (!sessions.value.length) {
      const s = emptySession()
      sessions.value = [s]
      activeId.value = s.id
    } else if (activeId.value === id) {
      activeId.value = sessions.value[0].id
    }
    persist()
  }

  function clearActive() {
    const s = activeSession.value
    if (!s) return
    s.messages = []
    s.title = '新对话'
    s.updatedAt = new Date().toISOString()
    persist()
  }

  function push(msg: ChatMessage) {
    const s = activeSession.value
    if (!s) return
    s.messages.push(msg)
    if (msg.role === 'user' && s.title === '新对话') {
      s.title = msg.content.slice(0, 24) || '新对话'
    }
    s.updatedAt = new Date().toISOString()
    persist()
  }

  function patch(id: string, partial: Partial<ChatMessage>) {
    const s = activeSession.value
    if (!s) return
    const item = s.messages.find((m) => m.id === id)
    if (!item) return
    Object.assign(item, partial)
    s.updatedAt = new Date().toISOString()
    persist()
  }

  function historyForApi(limit = 8) {
    return messages.value
      .filter((m) => !m.streaming && m.content)
      .slice(-limit)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  return {
    sessions,
    activeId,
    activeSession,
    messages,
    load,
    persist,
    createSession,
    renameSession,
    selectSession,
    removeSession,
    clearActive,
    push,
    patch,
    historyForApi,
  }
})
