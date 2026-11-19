<template>
  <section class="page-card lab-page">
    <header class="lab-header">
      <div>
        <h1 class="page-title">检索实验室</h1>
        <p class="lab-desc">对比「关键词检索」和对话里的「向量 RAG」。关键词搜不到，不代表语义问答也不行。</p>
      </div>
    </header>

    <div class="lab-toolbar">
      <el-input
        v-model="keyword"
        clearable
        placeholder="输入关键词，例如：密码、重置、字段名"
        @keyup.enter="runSearch"
      />
      <el-button type="primary" :loading="loading" @click="runSearch">关键词检索</el-button>
      <el-button @click="askSemantic">用这个问题去对话（RAG）</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="searchKnowledge / 本页接口走子串匹配；对话页走 Embedding 相似度。两者命中不同是正常的。"
      style="margin-bottom: 14px"
    />

    <el-table :data="hits" empty-text="输入关键词后检索" v-loading="loading">
      <el-table-column type="index" width="60" label="#" />
      <el-table-column prop="docName" label="文档" min-width="180" />
      <el-table-column prop="content" label="命中片段" min-width="360" show-overflow-tooltip />
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button link type="primary" @click="askHit(row)">追问</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { searchChunks } from '../api/docs'

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const hits = ref<Array<{ docId: string; docName: string; content: string }>>([])

async function runSearch() {
  const q = keyword.value.trim()
  if (!q) {
    ElMessage.warning('请输入关键词')
    return
  }
  loading.value = true
  try {
    const res = await searchChunks(q)
    hits.value = res.data.data.hits
    if (!hits.value.length) ElMessage.info('关键词无命中，可试试对话页的语义问答')
  } finally {
    loading.value = false
  }
}

function askHit(row: { docId: string; docName: string; content: string }) {
  sessionStorage.setItem('docchat-prefill', `根据《${row.docName}》说明：${row.content.slice(0, 48)}`)
  sessionStorage.setItem('docchat-scope', JSON.stringify([row.docId]))
  router.push('/chat')
}

function askSemantic() {
  const q = keyword.value.trim() || '请总结知识库主要内容'
  sessionStorage.setItem('docchat-prefill', q.includes('？') || q.includes('?') ? q : `${q} 相关内容讲了什么？`)
  router.push('/chat')
}
</script>

<style scoped>
.lab-header {
  margin-bottom: 16px;
}
.lab-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.lab-toolbar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  margin-bottom: 14px;
}
@media (max-width: 900px) {
  .lab-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
