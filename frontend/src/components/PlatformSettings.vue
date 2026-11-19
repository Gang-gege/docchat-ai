<template>
  <div class="platform-grid">
    <section class="settings-panel">
      <h3>模型接入</h3>
      <p class="field-tip">当前使用：{{ using }}。密钥只保存在服务端 SQLite，页面上只显示掩码。</p>
      <el-form label-position="top">
        <el-form-item label="配置名称"><el-input v-model="form.name" placeholder="DeepSeek 生产" /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com" /></el-form-item>
        <el-form-item label="对话模型"><el-input v-model="form.chatModel" placeholder="deepseek-chat" /></el-form-item>
        <el-form-item label="Embedding 模型"><el-input v-model="form.embeddingModel" placeholder="text-embedding-3-small" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.apiKey" type="password" show-password placeholder="留空则保持原密钥" /></el-form-item>
        <el-form-item label="本地 Embedding">
          <el-switch v-model="form.useLocalEmbedding" />
        </el-form-item>
      </el-form>
      <div class="row">
        <el-button type="primary" @click="save">保存配置</el-button>
        <el-button @click="backToEnv">改回 .env</el-button>
      </div>
      <div v-for="item in models" :key="item.id" class="model-row">
        <div>
          <strong>{{ item.name }}</strong>
          <span>{{ item.chatModel }} · {{ item.hasKey ? item.apiKey : '无密钥' }}</span>
        </div>
        <div>
          <el-button v-if="!item.active" link type="primary" @click="activate(item.id)">启用</el-button>
          <el-tag v-else size="small">使用中</el-tag>
          <el-button link type="danger" @click="remove(item.id)">删除</el-button>
        </div>
      </div>
    </section>

    <section class="settings-panel">
      <h3>提示词方案</h3>
      <el-form label-position="top">
        <el-form-item label="名称"><el-input v-model="prompt.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="prompt.kind" style="width: 100%">
            <el-option label="问答" value="qa" />
            <el-option label="摘要" value="summary" />
            <el-option label="提取" value="extract" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容"><el-input v-model="prompt.content" type="textarea" :rows="5" /></el-form-item>
      </el-form>
      <el-button type="primary" @click="savePromptItem">保存方案</el-button>
      <div v-for="item in prompts" :key="item.id" class="model-row">
        <div>
          <strong>{{ item.name }}</strong>
          <span>{{ kindLabel(item.kind) }}{{ item.builtin ? ' · 内置' : '' }}</span>
        </div>
        <div>
          <el-button link @click="editPrompt(item)">编辑</el-button>
          <el-button v-if="!item.builtin" link type="danger" @click="removePrompt(item.id)">删除</el-button>
        </div>
      </div>
    </section>

    <section class="settings-panel settings-panel-wide">
      <h3>备份与迁移</h3>
      <p class="field-tip" v-if="info">SQLite · {{ formatSize(info.bytes) }} · {{ info.path }}</p>
      <div class="row">
        <el-button type="primary" @click="downloadBackup">下载备份</el-button>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".sqlite,.db" :on-change="onBackup">
          <el-button>恢复备份</el-button>
        </el-upload>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'
import {
  activateModel,
  deleteModel,
  deletePrompt,
  fetchBackupInfo,
  fetchModels,
  fetchPrompts,
  importBackup,
  saveModel,
  savePrompt,
  useEnvModel,
  type ModelProfile,
  type PromptTemplate,
} from '../api/platform'

const models = ref<ModelProfile[]>([])
const prompts = ref<PromptTemplate[]>([])
const using = ref('环境变量')
const info = ref<{ path: string; bytes: number } | null>(null)
const form = reactive({
  id: '',
  name: '',
  baseUrl: 'https://api.deepseek.com',
  chatModel: 'deepseek-chat',
  embeddingModel: 'text-embedding-3-small',
  apiKey: '',
  useLocalEmbedding: true,
})
const prompt = reactive({ id: '', name: '', kind: 'qa' as PromptTemplate['kind'], content: '' })

function kindLabel(kind: PromptTemplate['kind']) {
  if (kind === 'summary') return '摘要'
  if (kind === 'extract') return '提取'
  return '问答'
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function load() {
  const [modelRes, promptRes, infoRes] = await Promise.all([fetchModels(), fetchPrompts(), fetchBackupInfo()])
  models.value = modelRes.data.data.list
  using.value = modelRes.data.data.using
  prompts.value = promptRes.data.data.list
  info.value = infoRes.data.data
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写配置名称')
    return
  }
  await saveModel({ ...form, embeddingBaseUrl: form.baseUrl })
  form.apiKey = ''
  ElMessage.success('模型配置已保存')
  await load()
}

async function activate(id: string) {
  await activateModel(id)
  ElMessage.success('已切换')
  await load()
}

async function backToEnv() {
  await useEnvModel()
  ElMessage.success('已改回环境变量')
  await load()
}

async function remove(id: string) {
  await deleteModel(id)
  await load()
}

function editPrompt(item: PromptTemplate) {
  prompt.id = item.id
  prompt.name = item.name
  prompt.kind = item.kind
  prompt.content = item.content
}

async function savePromptItem() {
  await savePrompt({ ...prompt })
  ElMessage.success('提示词已保存')
  prompt.id = ''
  await load()
}

async function removePrompt(id: string) {
  await deletePrompt(id)
  await load()
}

function downloadBackup() {
  window.open('/api/backup', '_blank')
}

async function onBackup(file: UploadFile) {
  if (!file.raw) return
  await ElMessageBox.confirm('恢复会覆盖当前 SQLite 知识库，是否继续？', '恢复备份', { type: 'warning' })
  await importBackup(file.raw)
  ElMessage.success('已恢复，请刷新页面')
}

onMounted(load)
</script>

<style lang="scss" scoped>
.platform-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 14px;
}
.settings-panel-wide {
  grid-column: 1 / -1;
}
@media (max-width: 980px) {
  .platform-grid {
    grid-template-columns: 1fr;
  }
}
.row {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.model-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  span {
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
}
</style>
