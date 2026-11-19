<template>
  <div class="robot-root" :data-robot-theme="themeStore.theme">
    <button
      v-show="!open"
      type="button"
      class="robot-fab"
      :class="{ 'is-ready': posReady, 'is-dragging': dragKind === 'fab' }"
      :style="fabStyle"
      aria-label="打开 DocChat 机器人"
      title="拖动移动，点击打开"
      @pointerdown="onFabPointerDown"
    >
      <img class="robot-fab-img" :src="botGif" alt="" draggable="false" />
    </button>

    <transition name="robot-pop">
      <section
        v-if="open"
        class="robot-panel"
        :class="{ 'is-dragging': dragKind === 'panel' }"
        :style="panelStyle"
        role="dialog"
        aria-label="DocChat 机器人"
      >
        <header class="robot-head" @pointerdown="onHeadPointerDown">
          <img class="robot-head-bot" :src="botGif" alt="" draggable="false" />
          <div class="robot-head-text">
            <strong>DocChat 机器人</strong>
            <div ref="modeWrapRef" class="mode-wrap">
              <button type="button" class="mode-trigger" @click="modeMenu = !modeMenu">
                {{ currentMode.label }}
                <span aria-hidden="true">▾</span>
              </button>
              <div v-if="modeMenu" class="mode-menu">
                <button
                  v-for="item in MODES"
                  :key="item.id"
                  type="button"
                  class="mode-item"
                  :class="{ active: mode === item.id }"
                  @click="pickMode(item.id)"
                >
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.hint }}</small>
                </button>
              </div>
            </div>
          </div>
          <div class="robot-head-actions">
            <button type="button" title="新对话" :disabled="sending" @click="startNew">新对话</button>
            <button type="button" title="带到对话页" @click="continueInChat">对话页</button>
            <button type="button" class="icon-x" title="关闭" @click="open = false">×</button>
          </div>
        </header>

        <div ref="logRef" class="robot-log" @scroll="onLogScroll">
          <div v-if="!messages.length" class="robot-hero">
            <p>{{ currentMode.hint }}</p>
            <div class="quick-list">
              <button v-for="q in quickPrompts" :key="q" type="button" @click="ask(q)">{{ q }}</button>
            </div>
          </div>

          <div v-for="msg in messages" :key="msg.id" class="robot-row" :class="msg.role">
            <img v-if="msg.role === 'assistant'" class="robot-avatar" :src="botGif" alt="" />
            <div v-else class="robot-avatar is-user">我</div>
            <div class="robot-msg">
              <div v-if="msg.role === 'user'" class="robot-bubble is-user">{{ msg.content }}</div>
              <div v-else class="robot-bubble">
                <div
                  v-if="msg.content"
                  class="markdown-body robot-md"
                  v-html="renderMarkdown(msg.content)"
                />
                <span v-else-if="msg.streaming" class="typing">正在生成</span>
                <span v-if="msg.streaming && msg.content" class="cursor-blink" />
              </div>

              <div v-if="msg.rewriteQuery" class="meta-chip">改写检索：{{ msg.rewriteQuery }}</div>

              <button
                v-if="msg.agentLogs?.length"
                type="button"
                class="fold-btn"
                @click="toggleFold(msg.id, 'agent')"
              >
                {{ folded(msg.id, 'agent') ? '收起' : '查看' }}工具过程 · {{ msg.agentLogs.length }}
              </button>
              <div v-if="msg.agentLogs?.length && folded(msg.id, 'agent')" class="fold-box">
                <div v-for="(log, i) in msg.agentLogs" :key="i" class="fold-line">
                  <span>{{ log.thought }}</span>
                  <em v-if="log.tool">{{ log.tool }}</em>
                </div>
              </div>

              <button
                v-if="msg.citations?.length"
                type="button"
                class="fold-btn"
                @click="toggleFold(msg.id, 'cites')"
              >
                {{ folded(msg.id, 'cites') ? '收起' : '查看' }}引用来源 · {{ msg.citations.length }}
              </button>
              <div v-if="msg.citations?.length && folded(msg.id, 'cites')" class="fold-box">
                <div v-for="(cite, i) in msg.citations" :key="cite.docId + i" class="cite-mini">
                  <div>
                    <strong>[{{ i + 1 }}] {{ cite.docName }}</strong>
                    <span>{{ cite.score.toFixed(3) }}</span>
                  </div>
                  <p>{{ cite.content }}</p>
                </div>
              </div>

              <div v-if="msg.role === 'assistant' && !msg.streaming" class="msg-ops">
                <button type="button" @click="copyText(msg.content)">复制</button>
                <button v-if="canRetry(msg)" type="button" @click="retry(msg.id)">重试</button>
              </div>
            </div>
          </div>

          <div v-if="stageText" class="stage-pill">{{ stageText }}</div>
        </div>

        <form class="robot-composer" @submit.prevent="send()">
          <textarea
            v-model="draft"
            rows="2"
            :placeholder="currentMode.placeholder"
            @keydown.enter.exact.prevent="send()"
          />
          <div class="composer-bar">
            <div class="pills">
              <button type="button" class="pill" :class="{ on: memory }" @click="memory = !memory">多轮记忆</button>
              <button type="button" class="pill" :class="{ on: rewrite }" @click="rewrite = !rewrite">查询改写</button>
            </div>
            <button
              v-if="sending"
              type="button"
              class="send-btn is-stop"
              title="停止"
              @click="stop()"
            >
              停止
            </button>
            <button v-else type="submit" class="send-btn" :disabled="!draft.trim()">发送</button>
          </div>
        </form>
      </section>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import botGif from '../assets/bot.gif'
import { openChatStream } from '../api/chat'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useThemeStore } from '../stores/theme'
import type { AgentLog, ChatMessage, Citation } from '../types'
import { renderMarkdown, STAGE_LABEL } from '../utils/markdown'

type Mode = 'knowledge' | 'agent'
type DragKind = 'fab' | 'panel' | null

const MODES: Array<{ id: Mode; label: string; hint: string; placeholder: string }> = [
  {
    id: 'knowledge',
    label: '知识问答',
    hint: '只根据已入库文档回答，并附上引用片段。',
    placeholder: '问文档里的内容，Enter 发送',
  },
  {
    id: 'agent',
    label: '智能体',
    hint: '可查时间、文档数量和清单；讲文档内容时仍会回到知识库。',
    placeholder: '查时间、文档数量，或继续问知识库',
  },
]

const QUICK: Record<Mode, string[]> = {
  knowledge: ['用三点总结知识库里最重要的内容', '文档里提到了哪些操作步骤？', '有没有写到限制或注意事项？'],
  agent: ['现在几点？', '知识库一共有多少篇、多少切片？', '现在知识库有哪些文档？'],
}

const FAB = 76
const POS_KEY = 'docchat-robot-pos'
const THREAD_KEY = 'docchat-robot-thread'

const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const themeStore = useThemeStore()

const open = ref(false)
const posReady = ref(false)
const fabLeft = ref(0)
const fabTop = ref(0)
const panelLeft = ref(12)
const panelTop = ref(12)
const dragKind = ref<DragKind>(null)
const mode = ref<Mode>('knowledge')
const modeMenu = ref(false)
const memory = ref(true)
const rewrite = ref(true)
const draft = ref('')
const sending = ref(false)
const stage = ref('')
const messages = ref<ChatMessage[]>([])
const folds = ref<Record<string, boolean>>({})
const logRef = ref<HTMLElement>()
const modeWrapRef = ref<HTMLElement>()
const stick = ref(true)

let stopStream: null | (() => void) = null
let dragMoved = false
let startX = 0
let startY = 0
let originL = 0
let originT = 0
let viewW = 0
let viewH = 0
let resizeTimer = 0
let saveTimer = 0

const currentMode = computed(() => MODES.find((item) => item.id === mode.value) || MODES[0])
const quickPrompts = computed(() => QUICK[mode.value])
const stageText = computed(() => (sending.value ? STAGE_LABEL[stage.value] || stage.value : ''))

const fabStyle = computed(() => {
  if (!posReady.value) return {}
  return {
    left: `${fabLeft.value}px`,
    top: `${fabTop.value}px`,
    right: 'auto',
    bottom: 'auto',
  }
})

const panelStyle = computed(() => ({
  left: `${panelLeft.value}px`,
  top: `${panelTop.value}px`,
}))

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), Math.max(min, max))
}

function clampFab(left: number, top: number) {
  return {
    left: clamp(left, 8, window.innerWidth - FAB - 8),
    top: clamp(top, 8, window.innerHeight - FAB - 8),
  }
}

function panelSize() {
  return {
    w: Math.min(400, window.innerWidth - 24),
    h: Math.min(560, window.innerHeight - 32),
  }
}

function defaultFab() {
  return clampFab(window.innerWidth - 24 - FAB, window.innerHeight - 92 - FAB)
}

function savePos() {
  viewW = window.innerWidth
  viewH = window.innerHeight
  localStorage.setItem(
    POS_KEY,
    JSON.stringify({ left: fabLeft.value, top: fabTop.value, vw: viewW, vh: viewH }),
  )
}

function initPos() {
  viewW = window.innerWidth
  viewH = window.innerHeight
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { left?: number; top?: number; vw?: number; vh?: number }
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        const baseW = parsed.vw || viewW
        const baseH = parsed.vh || viewH
        const next = clampFab((parsed.left / baseW) * viewW, (parsed.top / baseH) * viewH)
        fabLeft.value = next.left
        fabTop.value = next.top
        posReady.value = true
        return
      }
    }
  } catch {
    /* ignore broken cache */
  }
  const next = defaultFab()
  fabLeft.value = next.left
  fabTop.value = next.top
  posReady.value = true
}

function loadThread() {
  try {
    const raw = localStorage.getItem(THREAD_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as {
      mode?: Mode
      rewrite?: boolean
      memory?: boolean
      messages?: ChatMessage[]
    }
    if (data.mode === 'knowledge' || data.mode === 'agent') mode.value = data.mode
    if (typeof data.rewrite === 'boolean') rewrite.value = data.rewrite
    if (typeof data.memory === 'boolean') memory.value = data.memory
    if (Array.isArray(data.messages)) {
      messages.value = data.messages.map((item) => ({ ...item, streaming: false, stage: undefined }))
    }
  } catch {
    /* ignore broken cache */
  }
}

function persistThread() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    localStorage.setItem(
      THREAD_KEY,
      JSON.stringify({
        mode: mode.value,
        rewrite: rewrite.value,
        memory: memory.value,
        messages: messages.value.map((item) => ({ ...item, streaming: false, stage: undefined })),
      }),
    )
  }, 180)
}

function placePanel() {
  const { w, h } = panelSize()
  let left = fabLeft.value + FAB - w
  let top = fabTop.value - 12 - h
  if (top < 12) top = fabTop.value + FAB + 12
  panelLeft.value = clamp(left, 12, window.innerWidth - w - 12)
  panelTop.value = clamp(top, 12, window.innerHeight - h - 12)
}

function parkFab() {
  const { w, h } = panelSize()
  const next = clampFab(panelLeft.value + w - FAB, panelTop.value + h - FAB)
  fabLeft.value = next.left
  fabTop.value = next.top
  savePos()
}

function onFabPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  beginDrag('fab', event)
}

function onHeadPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, input, textarea')) return
  beginDrag('panel', event)
}

function beginDrag(kind: 'fab' | 'panel', event: PointerEvent) {
  dragKind.value = kind
  dragMoved = false
  startX = event.clientX
  startY = event.clientY
  originL = kind === 'fab' ? fabLeft.value : panelLeft.value
  originT = kind === 'fab' ? fabTop.value : panelTop.value
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!dragKind.value) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true
  if (dragKind.value === 'fab') {
    const next = clampFab(originL + dx, originT + dy)
    fabLeft.value = next.left
    fabTop.value = next.top
    return
  }
  const { w, h } = panelSize()
  panelLeft.value = clamp(originL + dx, 12, window.innerWidth - w - 12)
  panelTop.value = clamp(originT + dy, 12, window.innerHeight - h - 12)
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  const kind = dragKind.value
  dragKind.value = null
  if (kind === 'fab') {
    if (dragMoved) savePos()
    else {
      placePanel()
      open.value = true
    }
  } else if (kind === 'panel' && dragMoved) {
    parkFab()
  }
  dragMoved = false
}

function onResize() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    if (viewW && viewH && (w !== viewW || h !== viewH)) {
      const next = clampFab((fabLeft.value / viewW) * w, (fabTop.value / viewH) * h)
      fabLeft.value = next.left
      fabTop.value = next.top
      viewW = w
      viewH = h
      savePos()
    }
    if (open.value) {
      const size = panelSize()
      panelLeft.value = clamp(panelLeft.value, 12, w - size.w - 12)
      panelTop.value = clamp(panelTop.value, 12, h - size.h - 12)
    }
  }, 80)
}

function onDocPointerDown(event: PointerEvent) {
  if (!modeMenu.value) return
  const wrap = modeWrapRef.value
  if (wrap && event.target instanceof Node && !wrap.contains(event.target)) modeMenu.value = false
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    modeMenu.value = false
    open.value = false
  }
}

function pickMode(next: Mode) {
  mode.value = next
  modeMenu.value = false
  persistThread()
}

function folded(id: string, kind: 'agent' | 'cites') {
  return !!folds.value[`${id}:${kind}`]
}

function toggleFold(id: string, kind: 'agent' | 'cites') {
  const key = `${id}:${kind}`
  folds.value = { ...folds.value, [key]: !folds.value[key] }
}

function onLogScroll() {
  const el = logRef.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

async function scrollBottom(force = false) {
  await nextTick()
  const el = logRef.value
  if (!el) return
  if (force || stick.value) el.scrollTop = el.scrollHeight
}

function stop() {
  stopStream?.()
  stopStream = null
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function canRetry(msg: ChatMessage) {
  if (sending.value || msg.role !== 'assistant') return false
  const idx = messages.value.findIndex((item) => item.id === msg.id)
  return idx > 0 && idx === messages.value.length - 1
}

function startNew() {
  if (sending.value) stop()
  messages.value = []
  draft.value = ''
  stage.value = ''
  folds.value = {}
  persistThread()
}

async function continueInChat() {
  if (sending.value) stop()
  if (messages.value.length) {
    chat.createSession()
    messages.value.forEach((item) => {
      chat.push({ ...item, streaming: false, stage: undefined })
    })
  }
  open.value = false
  await router.push('/chat')
}

function historyForApi() {
  if (!memory.value) return []
  return messages.value
    .filter((item) => !item.streaming && item.content)
    .slice(-8)
    .map((item) => ({ role: item.role, content: item.content }))
}

function ask(text: string) {
  draft.value = text
  void send()
}

function retry(assistantId: string) {
  const idx = messages.value.findIndex((item) => item.id === assistantId)
  if (idx < 1) return
  let userIdx = -1
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages.value[i].role === 'user') {
      userIdx = i
      break
    }
  }
  if (userIdx < 0) return
  const text = messages.value[userIdx].content
  messages.value = messages.value.slice(0, userIdx)
  persistThread()
  draft.value = text
  void send()
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  draft.value = ''
  sending.value = true
  stage.value = mode.value === 'agent' ? 'agent' : 'retrieve'
  stick.value = true

  const history = historyForApi()
  messages.value.push({
    id: uid(),
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
  })
  const aid = uid()
  messages.value.push({
    id: aid,
    role: 'assistant',
    content: '',
    citations: [],
    agentLogs: [],
    streaming: true,
    stage: stage.value,
    createdAt: new Date().toISOString(),
  })
  persistThread()
  await scrollBottom(true)

  const citations: Citation[] = []
  const agentLogs: AgentLog[] = []
  let content = ''
  let rewriteQuery = ''

  const patch = (partial: Partial<ChatMessage>) => {
    const item = messages.value.find((row) => row.id === aid)
    if (!item) return
    Object.assign(item, partial)
    persistThread()
  }

  stopStream = openChatStream(
    {
      question: text,
      topK: settings.topK,
      temperature: settings.temperature,
      enableAgent: mode.value === 'agent',
      enableRewrite: rewrite.value,
      scoreThreshold: settings.scoreThreshold,
      history,
      systemPrompt: settings.systemPrompt,
    },
    {
      onStatus(next) {
        stage.value = next
        patch({ stage: next })
      },
      onRewrite(payload) {
        rewriteQuery = payload.query
        patch({ rewriteQuery })
      },
      onToken(chunk) {
        content += chunk
        patch({ content, streaming: true })
        void scrollBottom()
      },
      onCitations(items) {
        citations.splice(0, citations.length, ...items)
        patch({ citations: [...citations] })
      },
      onAgent(log) {
        agentLogs.push(log)
        patch({ agentLogs: [...agentLogs] })
      },
      onDone() {
        patch({ content, citations, agentLogs, rewriteQuery, streaming: false, stage: undefined })
        sending.value = false
        stage.value = ''
        stopStream = null
        void scrollBottom()
      },
      onError(msg) {
        if (msg === '已停止生成') {
          patch({
            content: content || '（已停止生成）',
            citations,
            agentLogs,
            rewriteQuery,
            streaming: false,
            stage: undefined,
          })
        } else if (!content) {
          patch({ content: `出错：${msg}`, streaming: false, stage: undefined })
          ElMessage.error(msg)
        } else {
          patch({ streaming: false, stage: undefined })
          ElMessage.error(msg)
        }
        sending.value = false
        stage.value = ''
        stopStream = null
      },
    },
  )
}

watch([memory, rewrite], () => persistThread())

watch(open, async (visible) => {
  if (!visible) {
    modeMenu.value = false
    return
  }
  placePanel()
  await scrollBottom(true)
})

onMounted(() => {
  initPos()
  loadThread()
  window.addEventListener('resize', onResize)
  window.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  onPointerUp()
  stop()
  window.clearTimeout(resizeTimer)
  window.clearTimeout(saveTimer)
  persistThread()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.robot-fab {
  position: fixed;
  right: 24px;
  bottom: 92px;
  z-index: 1200;
  width: 76px;
  height: 76px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: grab;
  touch-action: none;
  filter: drop-shadow(0 12px 18px rgba(15, 23, 42, 0.28));
}

.robot-root[data-robot-theme='dark'] .robot-fab,
.robot-root[data-robot-theme='ink'] .robot-fab {
  filter: none;
}

.robot-root[data-robot-theme='dark'] .robot-fab::before,
.robot-root[data-robot-theme='ink'] .robot-fab::before,
.robot-root[data-robot-theme='dark'] .robot-fab::after,
.robot-root[data-robot-theme='ink'] .robot-fab::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.robot-root[data-robot-theme='dark'] .robot-fab::before,
.robot-root[data-robot-theme='ink'] .robot-fab::before {
  z-index: 0;
  inset: 6px;
}

.robot-root[data-robot-theme='dark'] .robot-fab::after,
.robot-root[data-robot-theme='ink'] .robot-fab::after {
  z-index: 2;
  inset: 0;
  mix-blend-mode: multiply;
}

.robot-root[data-robot-theme='dark'] .robot-fab::before {
  background: radial-gradient(circle at 50% 36%, rgba(45, 212, 191, 0.42), #07111c 70%);
  box-shadow:
    inset 0 0 0 1px rgba(94, 234, 212, 0.72),
    0 0 0 4px rgba(45, 212, 191, 0.16),
    0 0 18px rgba(45, 212, 191, 0.38);
}

.robot-root[data-robot-theme='dark'] .robot-fab::after {
  background: rgba(8, 78, 74, 0.28);
}

.robot-root[data-robot-theme='dark'] .robot-fab-img {
  transform: scale(0.84);
  filter: sepia(0.55) hue-rotate(125deg) saturate(2.4) brightness(0.82) contrast(1.08);
}

.robot-root[data-robot-theme='ink'] .robot-fab::before {
  background: radial-gradient(circle at 50% 36%, rgba(129, 140, 248, 0.5), #10162e 70%);
  box-shadow:
    inset 0 0 0 1px rgba(165, 180, 252, 0.8),
    0 0 0 4px rgba(129, 140, 248, 0.18),
    0 0 20px rgba(99, 102, 241, 0.48);
}

.robot-root[data-robot-theme='ink'] .robot-fab::after {
  background: rgba(55, 48, 163, 0.28);
}

.robot-root[data-robot-theme='ink'] .robot-fab-img {
  transform: scale(0.84);
  filter: sepia(0.7) hue-rotate(195deg) saturate(2.6) brightness(0.88) contrast(1.08);
}

.robot-fab.is-dragging {
  cursor: grabbing;
}

.robot-fab.is-ready:not(.is-dragging):hover {
  transform: translateY(-2px);
}

.robot-fab-img,
.robot-head-bot,
.robot-avatar {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.robot-root[data-robot-theme='dark'] .robot-head-bot,
.robot-root[data-robot-theme='dark'] .robot-avatar:not(.is-user) {
  border-radius: 50%;
  background: #07111c;
  box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.5);
  filter: sepia(0.55) hue-rotate(125deg) saturate(2.2) brightness(0.86);
}

.robot-root[data-robot-theme='ink'] .robot-head-bot,
.robot-root[data-robot-theme='ink'] .robot-avatar:not(.is-user) {
  border-radius: 50%;
  background: #10162e;
  box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.6);
  filter: sepia(0.7) hue-rotate(195deg) saturate(2.4) brightness(0.9);
}

.robot-panel {
  position: fixed;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 24px));
  height: min(560px, calc(100vh - 32px));
  overflow: hidden;
  color: var(--text);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.robot-panel.is-dragging {
  cursor: grabbing;
  user-select: none;
}

.robot-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--line);
  cursor: grab;
  touch-action: none;
}

.robot-head-bot {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}

.robot-head-text {
  min-width: 0;
  flex: 1;
}

.robot-head-text strong {
  display: block;
  font-family: var(--display);
  font-size: 16px;
  letter-spacing: -0.02em;
}

.mode-wrap {
  position: relative;
  margin-top: 2px;
}

.mode-trigger,
.robot-head-actions button,
.pill,
.send-btn,
.quick-list button,
.fold-btn,
.msg-ops button {
  font: inherit;
  cursor: pointer;
}

.mode-trigger {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 12px;
}

.mode-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 2;
  width: 240px;
  padding: 6px;
  background: var(--card-solid);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
}

.mode-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.mode-item strong {
  font-size: 13px;
}

.mode-item small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.mode-item.active,
.mode-item:hover {
  background: var(--brand-soft);
}

.robot-head-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.robot-head-actions button {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}

.robot-head-actions button:hover:not(:disabled) {
  color: var(--text);
  border-color: color-mix(in srgb, var(--brand) 40%, var(--line));
}

.robot-head-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.robot-head-actions .icon-x {
  width: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.robot-log {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 14px 8px;
}

.robot-log:has(.robot-hero) {
  display: flex;
  flex-direction: column;
}

.robot-hero {
  margin: auto 0;
  padding: 12px 8px;
  text-align: center;
}

.robot-hero p {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-list button {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--brand-soft);
  color: var(--text);
  font-size: 13px;
  text-align: left;
}

.quick-list button:hover {
  border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
}

.robot-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.robot-row.user {
  flex-direction: row-reverse;
}

.robot-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.robot-avatar.is-user {
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(145deg, var(--brand), var(--brand-2));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.robot-msg {
  min-width: 0;
  max-width: calc(100% - 36px);
}

.robot-bubble {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 16px 16px 16px 5px;
  background: var(--ai-bubble-bg);
  font-size: 13px;
  line-height: 1.65;
}

.robot-bubble.is-user {
  border: 0;
  border-radius: 16px 16px 5px 16px;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  color: #fff;
  white-space: pre-wrap;
  box-shadow: 0 8px 18px var(--brand-glow);
}

.robot-md :deep(pre),
.robot-md :deep(table) {
  max-width: 100%;
  overflow: auto;
}

.fold-btn,
.msg-ops button {
  margin-top: 6px;
  margin-right: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}

.fold-btn:hover,
.msg-ops button:hover {
  color: var(--brand);
}

.fold-box {
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
}

.fold-line {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  color: var(--muted);
  font-size: 12px;
}

.fold-line em {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-style: normal;
}

.cite-mini {
  padding: 6px 0;
  font-size: 12px;
}

.cite-mini + .cite-mini {
  border-top: 1px solid var(--line);
}

.cite-mini div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.cite-mini span,
.cite-mini p {
  color: var(--muted);
}

.cite-mini p {
  margin: 4px 0 0;
  line-height: 1.5;
}

.robot-composer {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--line);
}

.robot-composer textarea {
  width: 100%;
  min-height: 64px;
  max-height: 120px;
  padding: 10px 12px;
  resize: none;
  border: 1px solid var(--line);
  border-radius: 14px;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.robot-composer textarea:focus {
  border-color: color-mix(in srgb, var(--brand) 55%, transparent);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.pills {
  display: flex;
  gap: 6px;
}

.pill {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}

.pill.on {
  border-color: color-mix(in srgb, var(--brand) 35%, transparent);
  background: var(--brand-soft);
  color: var(--brand);
}

.send-btn {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  color: #fff;
  font-size: 13px;
}

.send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.send-btn.is-stop {
  background: transparent;
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
}

.robot-pop-enter-active,
.robot-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.robot-pop-enter-from,
.robot-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
