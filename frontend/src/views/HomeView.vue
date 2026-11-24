<template>
  <section class="page-card home-page">
    <header class="home-header">
      <div>
        <h1 class="page-title">项目总览</h1>
        <p class="home-desc">DocChat AI：上传私有文档 → 向量入库 → RAG 问答 / Agent 工具调用。下面是当前运行状态与快捷入口。</p>
      </div>
      <div class="home-actions">
        <el-button @click="$router.push('/knowledge')">去知识库</el-button>
        <el-button type="primary" @click="$router.push('/chat')">开始对话</el-button>
      </div>
    </header>

    <div class="stats-grid" v-if="stats">
      <div class="stat-card">
        <div class="stat-num">{{ stats.docCount }}</div>
        <div class="stat-label">文档数</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ stats.chunkCount }}</div>
        <div class="stat-label">向量切片</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ stats.avgChunks ?? 0 }}</div>
        <div class="stat-label">篇均切片</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ stats.llmConfigured ? '就绪' : '缺 Key' }}</div>
        <div class="stat-label">LLM · {{ stats.llmModel }}</div>
      </div>
    </div>

    <div class="home-grid">
      <div class="home-panel">
        <h3>能力清单（建议按这个顺序学）</h3>
        <ol class="learn-list">
          <li>知识库上传 PDF / Markdown / TXT，看切片数</li>
          <li>对话页切到「知识问答」，问文档内容，看引用</li>
          <li>再切到「智能体」，问「有哪些文档 / 现在几点」</li>
          <li>需要追问时打开「多轮记忆」和「查询改写」</li>
          <li>对话里可以限定文档范围，并切换简洁 / 提纲回答</li>
          <li>知识库可收藏、写笔记、生成摘要</li>
          <li>检索实验室做关键词检索对比向量问答</li>
        </ol>
      </div>

      <div class="home-panel">
        <h3>推荐提问</h3>
        <div class="suggest-list" v-if="stats?.suggestions?.length">
          <el-button
            v-for="(s, i) in stats.suggestions.slice(0, 6)"
            :key="i"
            class="suggest-btn"
            @click="goAsk(s)"
          >
            {{ s }}
          </el-button>
        </div>
        <el-empty v-else description="先去知识库上传文档，这里会生成推荐问题" :image-size="64" />
      </div>

      <div class="home-panel">
        <h3>运行信息</h3>
        <ul class="info-list" v-if="stats">
          <li><span>数据库</span><b>{{ stats.db }} / {{ stats.vectorBackend }}</b></li>
          <li><span>Embedding</span><b>{{ stats.embedding }}</b></li>
          <li><span>切片参数</span><b>{{ stats.chunkSize }} / overlap {{ stats.chunkOverlap }}</b></li>
          <li><span>总大小</span><b>{{ formatSize(stats.totalSize) }}</b></li>
        </ul>
      </div>

      <div class="home-panel">
        <h3>收藏文档</h3>
        <div v-if="favorites.length" class="recent-list">
          <button v-for="d in favorites" :key="d.docId" type="button" class="recent-item recent-btn" @click="askDoc(d)">
            <div class="recent-name">{{ d.name }}</div>
            <div class="recent-meta">{{ d.summary || '打开后只在这篇文档里提问' }}</div>
          </button>
        </div>
        <el-empty v-else description="在知识库点「收藏」后会出现在这里" :image-size="64" />
      </div>

      <div class="home-panel">
        <h3>最近会话</h3>
        <div v-if="chat.sessions.length" class="recent-list">
          <button
            v-for="s in chat.sessions.slice(0, 5)"
            :key="s.id"
            type="button"
            class="recent-item recent-btn"
            @click="openSession(s.id)"
          >
            <div class="recent-name">{{ s.title }}</div>
            <div class="recent-meta">{{ s.messages.length }} 条消息 · {{ formatTime(s.updatedAt) }}</div>
          </button>
        </div>
        <el-empty v-else description="还没有会话" :image-size="64" />
      </div>

      <div class="home-panel">
        <h3>最近文档</h3>
        <div v-if="stats?.recentDocs?.length" class="recent-list">
          <div v-for="d in stats.recentDocs" :key="d.name" class="recent-item">
            <div class="recent-name">{{ d.name }}</div>
            <div class="recent-meta">{{ d.chunkCount }} 切片 · {{ formatTime(d.createdAt) }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无文档" :image-size="64" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchDocs, fetchStats } from '../api/docs'
import { useChatStore } from '../stores/chat'
import type { DocItem, KnowledgeStats } from '../types'

const router = useRouter()
const chat = useChatStore()
const stats = ref<KnowledgeStats | null>(null)
const favorites = ref<DocItem[]>([])

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function goAsk(q: string) {
  sessionStorage.setItem('docchat-prefill', q)
  router.push('/chat')
}

function askDoc(doc: DocItem) {
  sessionStorage.setItem('docchat-prefill', doc.summary ? `请展开说明：${doc.summary}` : `「${doc.name}」主要讲了什么？`)
  sessionStorage.setItem('docchat-scope', JSON.stringify([doc.docId]))
  router.push('/chat')
}

function openSession(id: string) {
  chat.selectSession(id)
  router.push('/chat')
}

onMounted(async () => {
  const [statsRes, docsRes] = await Promise.all([fetchStats(), fetchDocs()])
  stats.value = statsRes.data.data
  favorites.value = docsRes.data.data.list.filter((item) => item.favorite).slice(0, 5)
})
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
}

.home-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.home-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  max-width: 760px;
}

.home-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.home-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow);
  color: var(--text);
}

.home-panel h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-family: var(--display);
}

.learn-list {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.9;
  font-size: 13px;
}

.suggest-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggest-btn {
  justify-content: flex-start;
  height: auto;
  white-space: normal;
  text-align: left;
  padding: 10px 12px;
}

.info-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.info-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #e8edf3;
  font-size: 13px;
}

.info-list li span {
  color: var(--muted);
}

.recent-item {
  padding: 10px 0;
  border-bottom: 1px solid #e8edf3;
}

.recent-btn {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.recent-name {
  font-size: 13px;
  font-weight: 600;
}

.recent-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .home-header {
    flex-direction: column;
  }
  .home-grid {
    grid-template-columns: 1fr;
  }
}
</style>
