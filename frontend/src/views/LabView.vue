<template>
  <section class="page-card lab-page">
    <header class="lab-header">
      <div>
        <h1 class="page-title">检索实验室</h1>
        <p class="lab-desc">同一句话同时跑关键词检索和向量检索，对照切片召回。TopK 用来观察召回数量。</p>
      </div>
    </header>

    <div class="lab-toolbar">
      <el-input v-model="keyword" clearable placeholder="输入要对照的问题或关键词" @keyup.enter="runSearch" />
      <el-input-number v-model="topK" :min="1" :max="12" />
      <el-button type="primary" :loading="loading" @click="runSearch">对照检索</el-button>
      <el-button @click="askSemantic">去对话追问</el-button>
    </div>

    <div class="compare">
      <div>
        <h3>关键词检索</h3>
        <el-table :data="hits" empty-text="无命中" v-loading="loading">
          <el-table-column prop="docName" label="文档" min-width="140" />
          <el-table-column prop="content" label="片段" min-width="220" show-overflow-tooltip />
          <el-table-column label="" width="70">
            <template #default="{ row }"><el-button link type="primary" @click="askHit(row)">追问</el-button></template>
          </el-table-column>
        </el-table>
      </div>
      <div>
        <h3>向量检索</h3>
        <el-table :data="vectors" empty-text="无命中" v-loading="loading">
          <el-table-column prop="docName" label="文档" min-width="140" />
          <el-table-column label="分数" width="80">
            <template #default="{ row }">{{ row.score.toFixed(3) }}</template>
          </el-table-column>
          <el-table-column prop="content" label="片段" min-width="220" show-overflow-tooltip />
          <el-table-column label="" width="70">
            <template #default="{ row }"><el-button link type="primary" @click="askHit(row)">追问</el-button></template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { searchChunks } from '../api/docs'
import { vectorSearch } from '../api/platform'

const router = useRouter()
const keyword = ref('')
const topK = ref(4)
const loading = ref(false)
const hits = ref<Array<{ docId: string; docName: string; content: string }>>([])
const vectors = ref<Array<{ docId: string; docName: string; content: string; score: number }>>([])

async function runSearch() {
  const q = keyword.value.trim()
  if (!q) {
    ElMessage.warning('请输入检索内容')
    return
  }
  loading.value = true
  try {
    const [keywordRes, vectorRes] = await Promise.all([searchChunks(q), vectorSearch(q, topK.value)])
    hits.value = keywordRes.data.data.hits.slice(0, topK.value)
    vectors.value = vectorRes.data.data.hits
  } finally {
    loading.value = false
  }
}

function askHit(row: { docId: string; content: string; docName: string }) {
  sessionStorage.setItem('docchat-prefill', `根据《${row.docName}》说明：${row.content.slice(0, 48)}`)
  sessionStorage.setItem('docchat-scope', JSON.stringify([row.docId]))
  router.push('/chat')
}

function askSemantic() {
  const q = keyword.value.trim()
  if (!q) return
  sessionStorage.setItem('docchat-prefill', q)
  router.push('/chat')
}
</script>

<style lang="scss" scoped>
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
  grid-template-columns: 1fr 120px auto auto;
  gap: 8px;
  margin-bottom: 14px;
}
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  h3 {
    margin: 0 0 8px;
    font-size: 15px;
  }
}
@media (max-width: 980px) {
  .lab-toolbar,
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
