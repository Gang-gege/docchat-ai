<template>
  <section class="page-card">
    <header class="block-head">
      <div>
        <h1 class="page-title">Agent 工作流</h1>
        <p class="block-desc">按顺序执行检索、摘要、提取或比对。保存后也可通过 POST /api/workflows/:id/run 给外部系统调用。</p>
      </div>
      <div class="block-actions">
        <el-button @click="addStep">加一步</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </div>
    </header>

    <div class="flow-layout">
      <aside>
        <button v-for="item in workflows" :key="item.id" type="button" class="flow-item" @click="load(item)">
          <strong>{{ item.name }}</strong>
          <span>{{ item.steps.length }} 步</span>
        </button>
        <el-button text @click="createNew">新建流程</el-button>
      </aside>
      <div>
        <el-input v-model="name" placeholder="流程名称，例如：公文比对" />
        <div v-for="(step, index) in steps" :key="index" class="step-row">
          <el-select v-model="step.type" style="width: 140px">
            <el-option label="检索" value="search" />
            <el-option label="摘要" value="summarize" />
            <el-option label="提取" value="extract" />
            <el-option label="比对" value="compare" />
          </el-select>
          <el-input v-model="step.input" placeholder="这一步的补充要求，可留空" />
          <el-button text type="danger" @click="steps.splice(index, 1)">删除</el-button>
        </div>
        <el-input v-model="input" type="textarea" :rows="3" placeholder="任务输入，例如：对比两份函的主办单位" />
        <el-button type="primary" :loading="running" style="margin-top: 8px" @click="run">运行</el-button>
        <div v-if="answer" class="answer">
          <h3>结果</h3>
          <pre>{{ answer }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchWorkflows, runWorkflow, saveWorkflow, type WorkflowItem, type WorkflowStep } from '../api/platform'

const workflows = ref<WorkflowItem[]>([])
const currentId = ref('')
const name = ref('资料汇总')
const steps = ref<WorkflowStep[]>([{ type: 'search', input: '' }, { type: 'summarize', input: '' }])
const input = ref('')
const answer = ref('')
const running = ref(false)

function createNew() {
  currentId.value = ''
  name.value = '未命名流程'
  steps.value = [{ type: 'search', input: '' }]
  answer.value = ''
}

function addStep() {
  steps.value.push({ type: 'extract', input: '' })
}

function load(item: WorkflowItem) {
  currentId.value = item.id
  name.value = item.name
  steps.value = item.steps.map((step) => ({ ...step }))
}

async function refresh() {
  const res = await fetchWorkflows()
  workflows.value = res.data.data.list
}

async function save() {
  const res = await saveWorkflow({ id: currentId.value || undefined, name: name.value, steps: steps.value })
  currentId.value = res.data.data.workflow.id
  ElMessage.success('流程已保存')
  await refresh()
}

async function run() {
  running.value = true
  try {
    const res = await runWorkflow({ steps: steps.value, input: input.value })
    answer.value = res.data.data.answer
  } finally {
    running.value = false
  }
}

onMounted(refresh)
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
}
.flow-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}
.flow-item {
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  span {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
  }
}
.step-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.answer {
  margin-top: 14px;
  pre {
    white-space: pre-wrap;
    line-height: 1.6;
  }
}
</style>
