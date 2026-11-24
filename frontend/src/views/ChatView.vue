<template>
  <section class="chat-layout">
    <aside class="session-panel">
      <div class="session-toolbar">
        <span class="session-heading">会话</span>
        <el-button text size="small" @click="showArchived = !showArchived">{{ showArchived ? '进行中' : '归档' }}</el-button>
        <el-button type="primary" size="small" @click="chat.createSession()">新建</el-button>
      </div>
      <div class="session-list">
        <button
          v-for="s in visibleSessions"
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
          <div v-if="s.tags?.length" class="session-tags">{{ s.tags.join(' · ') }}</div>
          <div class="session-meta">
            <span>{{ formatTime(s.updatedAt) }}</span>
            <span class="session-del" @click.stop="startRename(s.id, s.title)">重命名</span>
            <span class="session-del" @click.stop="chat.patchSession(s.id, { archived: !s.archived })">{{ s.archived ? '恢复' : '归档' }}</span>
            <span class="session-del" @click.stop="chat.removeSession(s.id)">删除</span>
          </div>
        </button>
      </div>
      <div v-if="chat.activeSession" class="session-foot">
        <label for="session-tags">标签</label>
        <el-input
          id="session-tags"
          v-model="tagText"
          size="small"
          placeholder="逗号分隔，回车保存"
          @change="saveTags(tagText)"
        />
        <el-button v-if="showArchived" text size="small" @click="chat.removeArchived()">清理归档</el-button>
      </div>
    </aside>

    <div class="chat-main">
      <header class="chat-header">
        <h1 class="page-title">知识库对话</h1>
        <div class="chat-actions">
          <el-button v-if="sending" type="danger" plain size="small" @click="stop">停止</el-button>
          <el-dropdown trigger="click">
            <el-button text>更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="exportMd">导出 Markdown</el-dropdown-item>
                <el-dropdown-item @click="exportJson">导出 JSON</el-dropdown-item>
                <el-dropdown-item @click="chat.clearActive()">清空当前会话</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="chat-log" ref="logRef">
        <div v-if="!chat.messages.length" class="chat-empty">
          <h3>开始提问</h3>
          <p>在下方选择问法，再输入问题。</p>
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

      <div class="composer">
        <div class="composer-card">
          <textarea
            v-model="question"
            rows="2"
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            @focus="openMenu = ''"
            @keydown.enter.exact.prevent="send"
          />
          <div class="composer-bar">
            <div class="composer-pills">
              <div class="pill-menu">
                <button type="button" class="pill is-on" title="切换问答方式" @click="toggleMenu('mode')">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.2h10v6.6H6.4L3 12.2V3.2z" /></svg>
                  {{ settings.enableAgent ? '智能体' : '知识问答' }}
                  <i class="caret" />
                </button>
                <div v-if="openMenu === 'mode'" class="pill-pop">
                  <button type="button" :class="{ active: !settings.enableAgent }" @click="pickMode(false)">
                    <strong>知识问答</strong>
                    <small>只根据文档回答</small>
                  </button>
                  <button type="button" :class="{ active: settings.enableAgent }" @click="pickMode(true)">
                    <strong>智能体</strong>
                    <small>可查时间、文档数量</small>
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="pill"
                :class="{ 'is-on': settings.enableMultiTurn }"
                title="带上最近几轮，可以接着追问"
                @click="settings.enableMultiTurn = !settings.enableMultiTurn"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h7.5V10H5.2L2.5 12.2V5.5zM6 3.5h7.5V8" /></svg>
                多轮
              </button>
              <button
                type="button"
                class="pill"
                :class="{ 'is-on': settings.enableRewrite && settings.enableMultiTurn }"
                :disabled="!settings.enableMultiTurn"
                title="有上文时，先把追问改写成完整检索句"
                @click="settings.enableRewrite = !settings.enableRewrite"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3.2l1.8 1.8L6.2 11.6H4.4V9.8L11 3.2zM9.4 4.8l1.8 1.8" /></svg>
                改写
              </button>

              <div class="pill-menu">
                <button type="button" class="pill" title="回答风格" @click="toggleMenu('style')">
                  {{ styleLabel }}
                  <i class="caret" />
                </button>
                <div v-if="openMenu === 'style'" class="pill-pop">
                  <button
                    v-for="item in styleOptions"
                    :key="item.value"
                    type="button"
                    :class="{ active: answerStyle === item.value }"
                    @click="pickStyle(item.value)"
                  >
                    <strong>{{ item.label }}</strong>
                  </button>
                </div>
              </div>

              <div class="pill-menu">
                <button
                  type="button"
                  class="pill"
                  :class="{ 'is-on': scopeIds.length }"
                  title="限定检索的文档，不选就是全部"
                  @click="toggleMenu('scope')"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.8h5.2L12 5.6v7.6H4V2.8zM9.2 2.8V5.6H12" /></svg>
                  {{ scopeLabel }}
                  <i class="caret" />
                </button>
                <div v-if="openMenu === 'scope'" class="pill-pop scope-pop">
                  <button type="button" :class="{ active: !scopeIds.length }" @click="scopeIds = []">
                    <strong>全部文档</strong>
                  </button>
                  <label v-for="doc in library" :key="doc.docId" class="scope-row" :title="doc.name">
                    <input v-model="scopeIds" type="checkbox" :value="doc.docId" />
                    <span>{{ doc.name }}</span>
                  </label>
                  <p v-if="!library.length" class="scope-empty">知识库还没有文档</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="composer-send"
              :class="{ busy: sending }"
              :disabled="!sending && !question.trim()"
              :title="sending ? '停止' : '发送'"
              @click="sending ? stop() : send()"
            >
              <span v-if="sending" class="stop-sq" />
              <svg v-else viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M9 3.5L13.5 8 9 12.5" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const openMenu = ref<'' | 'mode' | 'style' | 'scope'>('')
const library = ref<DocItem[]>([])
const scopeIds = ref<string[]>([])
const answerStyle = ref<'brief' | 'standard' | 'outline' | 'detail'>('standard')
const showArchived = ref(false)
const tagText = ref('')
const editingId = ref('')
const editingTitle = ref('')
const styleOptions = [
  { label: '简洁', value: 'brief' },
  { label: '标准', value: 'standard' },
  { label: '提纲', value: 'outline' },
  { label: '详解', value: 'detail' },
]
const styleLabel = computed(() => styleOptions.find((item) => item.value === answerStyle.value)?.label || '标准')
const scopeLabel = computed(() => {
  if (!scopeIds.value.length) return '全部'
  if (scopeIds.value.length === 1) {
    const name = library.value.find((doc) => doc.docId === scopeIds.value[0])?.name || '1 篇'
    return name.length > 10 ? `${name.slice(0, 10)}…` : name
  }
  return `${scopeIds.value.length} 篇`
})
const visibleSessions = computed(() => chat.sessions.filter((item) => Boolean(item.archived) === showArchived.value))
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

function toggleMenu(name: 'mode' | 'style' | 'scope') {
  openMenu.value = openMenu.value === name ? '' : name
}

function pickMode(agent: boolean) {
  settings.enableAgent = agent
  openMenu.value = ''
}

function pickStyle(value: 'brief' | 'standard' | 'outline' | 'detail') {
  answerStyle.value = value
  openMenu.value = ''
}

function onDocPointer(event: PointerEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('.pill-menu')) return
  openMenu.value = ''
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

function saveTags(value: string) {
  const tags = value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
  if (chat.activeId) chat.patchSession(chat.activeId, { tags })
}

function exportJson() {
  const payload = showArchived.value ? chat.sessions.filter((item) => item.archived) : chat.sessions.filter((item) => !item.archived)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `docchat-sessions-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
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

watch(
  scopeIds,
  (ids) => {
    if (chat.activeId) chat.patchSession(chat.activeId, { docIds: [...ids] })
  },
  { deep: true },
)

watch(
  () => chat.activeId,
  (id) => {
    const session = chat.sessions.find((item) => item.id === id)
    scopeIds.value = session?.docIds ? [...session.docIds] : []
    tagText.value = (session?.tags || []).join('，')
  },
)

onMounted(async () => {
  window.addEventListener('pointerdown', onDocPointer)
  const prefill = sessionStorage.getItem('docchat-prefill')
  if (prefill) {
    question.value = prefill
    sessionStorage.removeItem('docchat-prefill')
  }
  const scoped = sessionStorage.getItem('docchat-scope')
  const current = chat.sessions.find((item) => item.id === chat.activeId)
  tagText.value = (current?.tags || []).join('，')
  if (scoped) {
    sessionStorage.removeItem('docchat-scope')
    try {
      const ids = JSON.parse(scoped) as string[]
      if (Array.isArray(ids)) scopeIds.value = ids.filter((id) => typeof id === 'string')
    } catch {
      /* ignore */
    }
  } else if (current?.docIds?.length) {
    scopeIds.value = [...current.docIds]
  }
  try {
    const res = await fetchDocs()
    library.value = res.data.data.list
  } catch {
    library.value = []
  }
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('pointerdown', onDocPointer)
})
</script>

<style scoped>
.chat-header {
  align-items: center;
}
.session-foot {
  border-top: 1px solid var(--line);
  margin-top: 8px;
  padding-top: 10px;
}
.session-foot label {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 12px;
}
.composer {
  padding-top: 8px;
  padding-right: 72px;
}
.composer-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel, #fff);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.composer-card textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 52px;
  max-height: 140px;
  margin: 0;
  padding: 12px 14px 4px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
}
.composer-card textarea::placeholder {
  color: var(--muted);
}
.composer-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 4px 8px 8px;
}
.composer-pills {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.pill-menu {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.pill svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.pill.is-on {
  border-color: color-mix(in srgb, var(--brand) 35%, transparent);
  background: var(--brand-soft);
  color: var(--brand);
}
.pill:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.caret {
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-top: 4px solid currentColor;
  opacity: 0.7;
}
.pill-pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 20;
  min-width: 148px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel, #fff);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}
.pill-pop > button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pill-pop > button small {
  color: var(--muted);
  font-size: 11px;
}
.pill-pop > button.active,
.pill-pop > button:hover {
  background: var(--brand-soft);
}
.scope-pop {
  width: 260px;
  max-height: 240px;
  overflow: auto;
}
.scope-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.scope-row:hover {
  background: var(--brand-soft);
}
.scope-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scope-empty {
  margin: 0;
  padding: 8px 10px;
  color: var(--muted);
  font-size: 12px;
}
.composer-send {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}
.composer-send svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.composer-send:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
.composer-send.busy {
  background: #b91c1c;
}
.stop-sq {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: #fff;
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
