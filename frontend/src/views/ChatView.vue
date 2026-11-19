<template>
  <section class="chat-layout">
    <aside class="session-panel">
      <div class="session-toolbar">
        <span class="session-heading">会话</span>
        <el-button type="primary" size="small" @click="chat.createSession()">新建</el-button>
      </div>
      <div class="session-list">
        <button
          v-for="s in chat.sessions"
          :key="s.id"
          type="button"
          class="session-item"
          :class="{ active: s.id === chat.activeId }"
          @click="chat.selectSession(s.id)"
        >
          <input
            v-if="editingId === s.id"
            v-model="editingTitle"
            class="session-rename"
            maxlength="40"
            @click.stop
            @blur="commitRename(s.id)"
            @keydown.enter.prevent="commitRename(s.id)"
          />
          <div v-else class="session-title">{{ s.title }}</div>
          <div class="session-meta">
            <span>{{ formatTime(s.updatedAt) }}</span>
            <span class="session-del" @click.stop="startRename(s.id, s.title)">重命名</span>
            <span class="session-del" @click.stop="chat.removeSession(s.id)">删除</span>
          </div>
        </button>
      </div>
    </aside>

    <div class="chat-main">
      <header class="chat-header">
        <div>
          <h1 class="page-title">知识库对话</h1>
          <p class="chat-subtitle">可限定文档范围，并切换简洁、标准或提纲三种回答。</p>
        </div>
        <div class="chat-actions">
          <el-button text @click="exportMd">导出 MD</el-button>
          <el-button text @click="chat.clearActive()">清空</el-button>
          <el-button v-if="sending" type="danger" plain size="small" @click="stop">停止</el-button>
        </div>
      </header>

      <div class="chat-tools">
        <el-segmented v-model="answerStyle" :options="styleOptions" />
        <el-select
          v-model="scopeIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          filterable
          placeholder="检索范围：全部文档"
          class="scope-select"
        >
          <el-option v-for="doc in library" :key="doc.docId" :label="doc.name" :value="doc.docId" />
        </el-select>
      </div>

      <div class="chat-log" ref="logRef">
        <div v-if="!chat.messages.length" class="chat-empty">
          <h3>开始提问</h3>
          <p>直接输入问题即可，支持多轮追问。</p>
        </div>

        <div v-for="msg in chat.messages" :key="msg.id" class="msg-row" :class="msg.role">
          <div class="msg-avatar">{{ msg.role === 'user' ? '我' : 'AI' }}</div>
          <div class="msg-content">
            <div v-if="msg.role === 'user'" class="msg-bubble user-bubble">{{ msg.content }}</div>
            <div v-else class="msg-bubble ai-bubble">
              <div
                class="markdown-body"
                v-html="msg.content ? renderMarkdown(msg.content) : msg.streaming ? '<span class=\'typing\'>正在生成</span>' : ''"
              />
              <div v-if="msg.streaming" class="cursor-blink" />
            </div>

            <div v-if="msg.role === 'assistant' && !msg.streaming" class="msg-tools">
              <el-button link size="small" @click="copyText(msg.content)">复制</el-button>
              <el-button link size="small" @click="regenerate(msg.id)">重新生成</el-button>
            </div>

            <div v-if="msg.rewriteQuery" class="meta-chip">改写检索：{{ msg.rewriteQuery }}</div>

            <el-collapse v-if="msg.agentLogs?.length" class="meta-collapse">
              <el-collapse-item :title="agentSummary(msg.agentLogs)" name="agent">
                <div v-for="(log, i) in msg.agentLogs" :key="i" class="meta-line">
                  <span>{{ log.thought }}</span>
                  <span v-if="log.tool" class="meta-tag">{{ log.tool }}</span>
                </div>
              </el-collapse-item>
            </el-collapse>

            <el-collapse v-if="msg.citations?.length" class="meta-collapse">
              <el-collapse-item :title="`引用来源 ${msg.citations.length} 条`" name="cites">
                <div v-for="(cite, i) in msg.citations" :key="cite.docId + i" class="cite-card">
                  <div class="cite-head">
                    <strong>[{{ i + 1 }}] {{ cite.docName }}</strong>
                    <span>{{ cite.score.toFixed(3) }}</span>
                  </div>
                  <p>{{ cite.content }}</p>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>

        <div v-if="stageText" class="stage-pill">{{ stageText }}</div>
      </div>

      <div class="composer-wrap">
        <el-input
          v-model="question"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" class="send-btn" :loading="sending" :disabled="sending" @click="send">
          发送
        </el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { openChatStream } from '../api/chat'
import { fetchDocs } from '../api/docs'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import type { AgentLog, Citation, DocItem } from '../types'
import { renderMarkdown, STAGE_LABEL } from '../utils/markdown'

const chat = useChatStore()
const settings = useSettingsStore()
const question = ref('')
const sending = ref(false)
const currentStage = ref('')
const logRef = ref<HTMLElement>()
const library = ref<DocItem[]>([])
const scopeIds = ref<string[]>([])
const answerStyle = ref<'brief' | 'standard' | 'outline'>('standard')
const editingId = ref('')
const editingTitle = ref('')
const styleOptions = [
  { label: '简洁', value: 'brief' },
  { label: '标准', value: 'standard' },
  { label: '提纲', value: 'outline' },
]
let stopStream: null | (() => void) = null
let lastUserQuestion = ''

const stageText = computed(() => (sending.value ? STAGE_LABEL[currentStage.value] || currentStage.value : ''))

function agentSummary(logs: AgentLog[]) {
  const tools = logs.map((l) => l.tool).filter(Boolean)
  if (tools.length) return `过程详情 · 已调用 ${tools.join('、')}`
  return '过程详情'
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function scrollBottom() {
  await nextTick()
  if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
}

function startRename(id: string, title: string) {
  editingId.value = id
  editingTitle.value = title
}

function commitRename(id: string) {
  if (editingId.value !== id) return
  chat.renameSession(id, editingTitle.value)
  editingId.value = ''
}

function stop() {
  stopStream?.()
  stopStream = null
  sending.value = false
  currentStage.value = ''
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

function exportMd() {
  const lines = chat.messages.map((m) => `### ${m.role === 'user' ? '用户' : 'DocChat'}\n\n${m.content}\n`)
  const blob = new Blob([`# DocChat 会话导出\n\n${lines.join('\n')}`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `docchat-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function regenerate(assistantId: string) {
  const msgs = chat.messages
  const idx = msgs.findIndex((m) => m.id === assistantId)
  if (idx < 1) return
  let userIdx = -1
  for (let i = idx - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      userIdx = i
      break
    }
  }
  if (userIdx < 0) return
  const userMsg = msgs[userIdx]
  const s = chat.activeSession
  if (!s) return
  // 去掉该轮用户+助手及之后消息，再重新发送
  s.messages = msgs.slice(0, userIdx)
  chat.persist()
  question.value = userMsg.content
  void send()
}

async function send() {
  const text = question.value.trim()
  if (!text || sending.value) return
  question.value = ''
  lastUserQuestion = text
  sending.value = true
  currentStage.value = 'agent'

  const history = settings.enableMultiTurn
    ? chat.historyForApi(8)
    : ([] as Array<{ role: 'user' | 'assistant'; content: string }>)

  chat.push({ id: uid(), role: 'user', content: text, createdAt: new Date().toISOString() })
  const aid = uid()
  chat.push({
    id: aid,
    role: 'assistant',
    content: '',
    citations: [],
    agentLogs: [],
    streaming: true,
    stage: 'agent',
    createdAt: new Date().toISOString(),
  })
  await scrollBottom()

  const citations: Citation[] = []
  const agentLogs: AgentLog[] = []
  let content = ''
  let rewriteQuery = ''

  stopStream = openChatStream(
    {
      question: text,
      topK: settings.topK,
      temperature: settings.temperature,
      enableAgent: settings.enableAgent,
      enableRewrite: settings.enableRewrite && settings.enableMultiTurn,
      scoreThreshold: settings.scoreThreshold,
      history,
      systemPrompt: settings.systemPrompt,
      docIds: scopeIds.value,
      answerStyle: answerStyle.value,
    },
    {
      onStatus(stage) {
        currentStage.value = stage
        chat.patch(aid, { stage })
      },
      onRewrite(payload) {
        rewriteQuery = payload.query
        chat.patch(aid, { rewriteQuery })
      },
      onToken(chunk) {
        content += chunk
        chat.patch(aid, { content, streaming: true })
        void scrollBottom()
      },
      onCitations(items) {
        citations.splice(0, citations.length, ...items)
        chat.patch(aid, { citations: [...citations] })
      },
      onAgent(log) {
        agentLogs.push(log)
        chat.patch(aid, { agentLogs: [...agentLogs] })
      },
      onDone() {
        chat.patch(aid, { content, citations, agentLogs, rewriteQuery, streaming: false, stage: undefined })
        sending.value = false
        currentStage.value = ''
        stopStream = null
      },
      onError(msg) {
        if (msg === '已停止生成') {
          chat.patch(aid, {
            content: content || '（已停止生成）',
            citations,
            agentLogs,
            rewriteQuery,
            streaming: false,
            stage: undefined,
          })
        } else if (!content) {
          chat.patch(aid, { content: `出错：${msg}`, streaming: false, stage: undefined })
          ElMessage.error(msg)
        } else {
          chat.patch(aid, { streaming: false, stage: undefined })
          ElMessage.error(msg)
        }
        sending.value = false
        currentStage.value = ''
        stopStream = null
      },
    },
  )
}

onMounted(async () => {
  const prefill = sessionStorage.getItem('docchat-prefill')
  if (prefill) {
    question.value = prefill
    sessionStorage.removeItem('docchat-prefill')
  }
  const scoped = sessionStorage.getItem('docchat-scope')
  if (scoped) {
    sessionStorage.removeItem('docchat-scope')
    try {
      const ids = JSON.parse(scoped) as string[]
      if (Array.isArray(ids)) scopeIds.value = ids.filter((id) => typeof id === 'string')
    } catch {
      /* ignore */
    }
  }
  try {
    const res = await fetchDocs()
    library.value = res.data.data.list
  } catch {
    library.value = []
  }
})

onBeforeUnmount(() => stop())
</script>

<style scoped>
.chat-tools {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 0 4px;
}
.scope-select {
  width: 280px;
}
.session-rename {
  width: 100%;
  margin-bottom: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.msg-tools {
  margin-top: 4px;
}
</style>
