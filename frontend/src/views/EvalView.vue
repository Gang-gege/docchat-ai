<template>
  <section class="page-card eval-page">
    <header class="block-head">
      <div>
        <h1 class="page-title">检索检查</h1>
        <p class="block-desc">用来看提问后会不会找错文档。排不到第一，说明别的文档抢在前面；点「去问答」就用你指定的那篇接着问。</p>
      </div>
      <div class="actions">
        <span>只看前</span>
        <el-input-number v-model="topK" :min="1" :max="8" />
        <span>篇</span>
        <el-button @click="addCase">再加一题</el-button>
        <el-button type="primary" :loading="running" @click="run">检查</el-button>
      </div>
    </header>

    <article v-for="(item, index) in cases" :key="index" class="ask">
      <span class="tag">第 {{ index + 1 }} 题</span>
      <el-input v-model="item.question" placeholder="例如：这份函的发文机关是谁" />
      <el-select v-model="item.expectDoc" filterable placeholder="应该找到哪篇">
        <el-option v-for="doc in docs" :key="doc.docId" :label="shortName(doc.name)" :value="doc.name" />
      </el-select>
      <el-button link type="danger" :disabled="cases.length === 1" @click="cases.splice(index, 1)">删除</el-button>
    </article>

    <section v-if="report" class="report">
      <p class="summary">{{ summary }}</p>
      <article v-for="(row, index) in report.rows" :key="index" class="result">
        <div class="result-head">
          <div>
            <h2>{{ row.question }}</h2>
            <p class="judge" :class="{ ok: row.rank === 1, mid: row.hit && row.rank !== 1 }">{{ judgeText(row) }}</p>
          </div>
          <el-button @click="ask(row.question, row.expectDoc)">去问答</el-button>
        </div>
        <div class="rank-head">
          <span>名次</span>
          <span>找到的文档</span>
          <span>抽到的原文</span>
          <span />
        </div>
        <div v-for="(hit, hitIndex) in row.hits" :key="hitIndex" class="rank-row" :class="{ match: isMatch(hit.docName, row.expectDoc) }">
          <b>{{ hitIndex + 1 }}</b>
          <span :title="hit.docName">{{ shortName(hit.docName) }}</span>
          <span :title="hit.snippet">{{ hit.snippet }}</span>
          <em v-if="isMatch(hit.docName, row.expectDoc)">就是这篇</em>
          <span v-else />
        </div>
        <p v-if="!row.hits.length" class="empty">没有找到文档。</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fetchDocs } from '../api/docs'
import { fetchEvalCases, runEval, saveEvalCases } from '../api/platform'
import type { DocItem } from '../types'

const router = useRouter()
const cases = ref<Array<{ question: string; expectDoc: string }>>([])
const docs = ref<DocItem[]>([])
const topK = ref(4)
const running = ref(false)
const report = ref<Awaited<ReturnType<typeof runEval>>['data']['data'] | null>(null)

const summary = computed(() => {
  if (!report.value?.rows.length) return ''
  const first = report.value.rows.filter((row) => row.rank === 1).length
  const found = report.value.rows.filter((row) => row.hit).length
  return `${report.value.total} 道题里，${first} 道直接排第一，${found} 道出现在前 ${report.value.topK} 篇。排不到第一，就可以看原文是哪篇抢了位置。`
})

function shortName(name: string) {
  return name.replace(/\.pdf$/i, '')
}

function judgeText(row: { hit: boolean; rank: number | null; expectDoc: string }) {
  if (row.rank === 1) return `找对了。「${shortName(row.expectDoc)}」排在第 1。`
  if (row.hit) return `找到了，但排在第 ${row.rank}。前面的文档和它太像。`
  return `前 ${report.value?.topK || topK.value} 篇里没有这篇。`
}

function addCase() {
  cases.value.push({ question: '', expectDoc: '' })
}

function readyCases() {
  return cases.value
    .map((item) => ({ question: item.question.trim(), expectDoc: item.expectDoc.trim() }))
    .filter((item) => item.question && item.expectDoc)
}

function isMatch(docName: string, expectDoc: string) {
  const needle = expectDoc.trim().toLowerCase()
  return Boolean(needle) && docName.toLowerCase().includes(needle)
}

function ask(question: string, expectDoc: string) {
  const doc = docs.value.find((item) => item.name === expectDoc)
  sessionStorage.setItem('docchat-prefill', question)
  if (doc) sessionStorage.setItem('docchat-scope', JSON.stringify([doc.docId]))
  router.push('/chat')
}

async function run() {
  const list = readyCases()
  if (!list.length) {
    ElMessage.warning('先写问题，并选择应该找到的文档')
    return
  }
  running.value = true
  try {
    await saveEvalCases(list)
    cases.value = list
    const res = await runEval(topK.value)
    report.value = res.data.data
  } finally {
    running.value = false
  }
}

onMounted(async () => {
  const [caseRes, docRes] = await Promise.all([fetchEvalCases(), fetchDocs()])
  cases.value = caseRes.data.data.list.map((item) => ({ question: item.question, expectDoc: item.expectDoc }))
  docs.value = docRes.data.data.list
  if (!cases.value.length) addCase()
})
</script>

<style lang="scss" scoped>
.eval-page {
  overflow-x: hidden;
  overflow-y: auto;
  min-width: 0;
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 14px;
}
.block-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}
.actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}
.ask {
  display: grid;
  grid-template-columns: 64px minmax(0, 1.3fr) minmax(220px, 1fr) 48px;
  gap: 10px;
  align-items: center;
  min-width: 0;
  margin-bottom: 8px;
  :deep(.el-select),
  :deep(.el-input) {
    width: 100%;
    min-width: 0;
  }
  :deep(.el-select__selected-item) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.tag {
  color: var(--muted);
  font-size: 13px;
}
.summary {
  margin: 16px 0 10px;
  font-weight: 650;
}
.result {
  min-width: 0;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  h2 {
    margin: 0;
    font-size: 16px;
  }
}
.judge {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 680;
}
.judge.ok,
.judge.mid {
  color: var(--brand);
}
.rank-head,
.rank-row {
  display: grid;
  grid-template-columns: 48px minmax(180px, 0.9fr) minmax(0, 1.5fr) 72px;
  gap: 10px;
  align-items: center;
  min-width: 0;
}
.rank-head {
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}
.rank-row {
  padding: 8px 0;
  border-top: 1px solid var(--line);
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.rank-row.match span:nth-child(2) {
  color: var(--brand);
  font-weight: 650;
}
.rank-row b {
  color: var(--muted);
  font-weight: 560;
}
.rank-row em {
  font-style: normal;
  color: var(--brand);
  font-size: 12px;
}
.empty {
  margin: 8px 0 0;
  color: var(--muted);
}
@media (max-width: 900px) {
  .block-head,
  .ask,
  .rank-head,
  .rank-row {
    grid-template-columns: 1fr;
    display: grid;
  }
  .block-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
