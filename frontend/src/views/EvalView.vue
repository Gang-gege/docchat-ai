<template>
  <section class="page-card">
    <header class="block-head">
      <div>
        <h1 class="page-title">RAG 效果评测</h1>
        <p class="block-desc">每行一条：问题 || 期望文档名片段。运行后计算 Recall 和 MRR，用来对比不同 TopK。</p>
      </div>
      <div class="block-actions">
        <el-input-number v-model="topK" :min="1" :max="12" />
        <el-button @click="save">保存题集</el-button>
        <el-button type="primary" :loading="running" @click="run">开始评测</el-button>
      </div>
    </header>
    <el-input v-model="raw" type="textarea" :rows="8" placeholder="如何重置密码 || 产品手册" />
    <div v-if="report" class="metric-row">
      <div><b>{{ (report.recall * 100).toFixed(1) }}%</b><span>Recall@{{ report.topK }}</span></div>
      <div><b>{{ report.mrr.toFixed(3) }}</b><span>MRR</span></div>
      <div><b>{{ report.total }}</b><span>题目数</span></div>
    </div>
    <el-table v-if="report" :data="report.rows" style="margin-top: 12px">
      <el-table-column prop="question" label="问题" min-width="220" />
      <el-table-column prop="expectDoc" label="期望" min-width="140" />
      <el-table-column label="命中" width="80">
        <template #default="{ row }">{{ row.hit ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="rank" label="名次" width="80" />
      <el-table-column prop="topDoc" label="Top1 文档" min-width="180" />
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchEvalCases, runEval, saveEvalCases } from '../api/platform'

const raw = ref('')
const topK = ref(4)
const running = ref(false)
const report = ref<Awaited<ReturnType<typeof runEval>>['data']['data'] | null>(null)

function parseLines() {
  return raw.value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [question, expectDoc] = line.split('||')
      return { question: (question || '').trim(), expectDoc: (expectDoc || '').trim() }
    })
    .filter((item) => item.question)
}

async function save() {
  await saveEvalCases(parseLines())
  ElMessage.success('题集已保存')
}

async function run() {
  running.value = true
  try {
    await saveEvalCases(parseLines())
    const res = await runEval(topK.value)
    report.value = res.data.data
  } finally {
    running.value = false
  }
}

onMounted(async () => {
  const res = await fetchEvalCases()
  raw.value = res.data.data.list.map((item) => `${item.question} || ${item.expectDoc}`).join('\n')
})
</script>

<style lang="scss" scoped>
.block-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.block-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.block-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.metric-row {
  display: flex;
  gap: 12px;
  margin-top: 14px;
  div {
    min-width: 120px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--brand-soft);
  }
  b {
    display: block;
    font-family: var(--display);
    font-size: 24px;
  }
  span {
    color: var(--muted);
    font-size: 12px;
  }
}
</style>
