<template>
  <section class="page-card">
    <header class="block-head">
      <div>
        <h1 class="page-title">Agent 工作流</h1>
        <p class="block-desc">可以保存多条流程。新建或编辑在弹窗里完成，列表里点「使用」才会拿这条流程去跑任务。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建工作流</el-button>
    </header>

    <el-table :data="workflows" empty-text="还没有工作流，点右上角新建">
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="步骤" min-width="280">
        <template #default="{ row }">
          <span class="step-chain">{{ stepText(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="步数" width="80">
        <template #default="{ row }">{{ row.steps.length }}</template>
      </el-table-column>
      <el-table-column label="更新时间" min-width="170">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRun(row)">使用</el-button>
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editorOpen" :title="draft.id ? '编辑工作流' : '新建工作流'" width="680px" destroy-on-close>
      <el-form label-position="top" class="flow-form">
        <el-form-item label="名称">
          <el-input v-model="draft.name" maxlength="40" placeholder="例如：公文比对、资料汇总" />
        </el-form-item>
        <el-form-item label="步骤">
          <div class="step-editor">
            <article v-for="(step, index) in draft.steps" :key="index" class="step-card">
              <div class="step-card-head">
                <span class="step-no">第 {{ index + 1 }} 步</span>
                <el-select v-model="step.type">
                  <el-option v-for="item in stepOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
                <el-button link type="danger" :disabled="draft.steps.length === 1" @click="draft.steps.splice(index, 1)">移除</el-button>
              </div>
              <el-input v-model="step.input" placeholder="补充要求，例如：只提取主办单位和日期。留空就沿用上一步的结果。" />
            </article>
            <el-button class="add-step" :disabled="draft.steps.length >= 8" @click="draft.steps.push({ type: 'extract', input: '' })">加一步</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="runOpen" title="使用工作流" width="720px" destroy-on-close>
      <template v-if="runningItem">
        <p class="run-name">{{ runningItem.name }}</p>
        <p class="run-chain">{{ stepText(runningItem) }}</p>
        <el-input v-model="taskInput" type="textarea" :rows="4" placeholder="写下这次要处理的任务，例如：对比两份函的主办单位" />
        <p class="api-line">外部系统也可调用 <code>POST /api/workflows/{{ runningItem.id }}/run</code>，请求体 <code>{"input":"..."}</code></p>
        <div v-if="answer" class="answer">
          <h3>结果</h3>
          <pre>{{ answer }}</pre>
        </div>
      </template>
      <template #footer>
        <el-button @click="runOpen = false">关闭</el-button>
        <el-button type="primary" :loading="running" @click="run">运行</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteWorkflow,
  fetchWorkflows,
  runSavedWorkflow,
  saveWorkflow,
  type WorkflowItem,
  type WorkflowStep,
} from '../api/platform'

const stepOptions: Array<{ value: WorkflowStep['type']; label: string }> = [
  { value: 'search', label: '检索' },
  { value: 'summarize', label: '摘要' },
  { value: 'extract', label: '提取' },
  { value: 'compare', label: '比对' },
]

const workflows = ref<WorkflowItem[]>([])
const editorOpen = ref(false)
const saving = ref(false)
const draft = reactive<{ id: string; name: string; steps: WorkflowStep[] }>({
  id: '',
  name: '',
  steps: [],
})

const runOpen = ref(false)
const running = ref(false)
const runningItem = ref<WorkflowItem | null>(null)
const taskInput = ref('')
const answer = ref('')

function labelOf(type: WorkflowStep['type']) {
  return stepOptions.find((item) => item.value === type)?.label || type
}

function stepText(item: WorkflowItem) {
  return item.steps.map((step) => labelOf(step.type)).join(' → ')
}

function formatTime(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}

function openCreate() {
  draft.id = ''
  draft.name = ''
  draft.steps = [
    { type: 'search', input: '' },
    { type: 'summarize', input: '' },
  ]
  editorOpen.value = true
}

function openEdit(item: WorkflowItem) {
  draft.id = item.id
  draft.name = item.name
  draft.steps = item.steps.map((step) => ({ type: step.type, input: step.input || '' }))
  editorOpen.value = true
}

function openRun(item: WorkflowItem) {
  runningItem.value = item
  taskInput.value = ''
  answer.value = ''
  runOpen.value = true
}

async function refresh() {
  const res = await fetchWorkflows()
  workflows.value = res.data.data.list
}

async function save() {
  const name = draft.name.trim()
  if (!name) {
    ElMessage.warning('请填写工作流名称')
    return
  }
  if (!draft.steps.length) {
    ElMessage.warning('至少保留一步')
    return
  }
  saving.value = true
  try {
    await saveWorkflow({
      id: draft.id || undefined,
      name,
      steps: draft.steps.map((step) => ({ type: step.type, input: step.input?.trim() || '' })),
    })
    ElMessage.success(draft.id ? '工作流已更新' : '工作流已创建')
    editorOpen.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(item: WorkflowItem) {
  await ElMessageBox.confirm(`删除「${item.name}」后不能恢复，是否继续？`, '删除工作流', { type: 'warning' })
  await deleteWorkflow(item.id)
  ElMessage.success('已删除')
  await refresh()
}

async function run() {
  if (!runningItem.value) return
  const input = taskInput.value.trim()
  if (!input) {
    ElMessage.warning('请先写下这次要处理的任务')
    return
  }
  running.value = true
  try {
    const res = await runSavedWorkflow(runningItem.value.id, input)
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
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.block-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.step-chain {
  color: var(--text);
}
.flow-form :deep(.el-form-item__content) {
  display: block;
}
.step-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.step-card {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--brand-soft);
}
.step-card-head {
  display: grid;
  grid-template-columns: 64px 160px 1fr;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  .el-button {
    justify-self: end;
  }
}
.step-no {
  font-weight: 650;
}
.add-step {
  align-self: flex-start;
}
.run-name {
  margin: 0;
  font-weight: 650;
}
.run-chain {
  margin: 6px 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.api-line {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  code {
    font-family: Consolas, "Courier New", monospace;
  }
}
.answer {
  margin-top: 14px;
  pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }
}
</style>
