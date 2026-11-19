<template>
  <section class="page-card settings-page">
    <header class="settings-header">
      <div>
        <h1 class="page-title">模型与检索设置</h1>
        <p class="settings-desc">
          API Key 在 <code>server/.env</code>。本页参数存浏览器本地；系统提示词会随每次问答发给 BFF。
        </p>
      </div>
      <div class="settings-actions">
        <el-button @click="reload">从服务端同步</el-button>
        <el-button type="primary" @click="save">保存到本地</el-button>
      </div>
    </header>

    <div class="settings-grid">
      <div class="settings-panel">
        <h3>模型信息</h3>
        <el-form label-position="top">
          <el-form-item label="Base URL">
            <el-input v-model="settings.llmBaseUrl" disabled />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input v-model="settings.llmModel" disabled />
          </el-form-item>
          <el-form-item label="温度">
            <el-slider v-model="settings.temperature" :min="0" :max="1" :step="0.05" show-input />
          </el-form-item>
        </el-form>
      </div>

      <div class="settings-panel">
        <h3>检索参数</h3>
        <el-form label-position="top">
          <el-form-item label="TopK">
            <el-input-number v-model="settings.topK" :min="1" :max="12" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="相似度阈值">
            <el-input-number
              v-model="settings.scoreThreshold"
              :min="0"
              :max="1"
              :step="0.01"
              controls-position="right"
              style="width: 100%"
            />
            <div class="field-tip">本地简易向量建议 0.05～0.2。</div>
          </el-form-item>
          <el-form-item label="服务端切片参数（只读）">
            <el-input :model-value="`chunkSize=${settings.chunkSize}, overlap=${settings.chunkOverlap}`" disabled />
          </el-form-item>
        </el-form>
      </div>

      <div class="settings-panel">
        <h3>对话能力</h3>
        <div class="switch-list">
          <div class="switch-row">
            <div>
              <div class="switch-title">启用 Agent</div>
              <div class="switch-desc">时间、文档清单等工具调用</div>
            </div>
            <el-switch v-model="settings.enableAgent" />
          </div>
          <div class="switch-row">
            <div>
              <div class="switch-title">多轮对话记忆</div>
              <div class="switch-desc">支持指代追问</div>
            </div>
            <el-switch v-model="settings.enableMultiTurn" />
          </div>
          <div class="switch-row">
            <div>
              <div class="switch-title">查询改写</div>
              <div class="switch-desc">多轮时先改写检索句</div>
            </div>
            <el-switch v-model="settings.enableRewrite" :disabled="!settings.enableMultiTurn" />
          </div>
        </div>
      </div>

      <div class="settings-panel">
        <h3>危险操作 / 说明</h3>
        <el-button type="danger" plain @click="clearKb">清空整个知识库</el-button>
        <el-alert
          style="margin-top: 12px"
          title="更换模型：改 server/.env 的 LLM_* 后重启 BFF。清空知识库会删除 SQLite 中文档、切片与 storage 原文件。"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <div class="settings-panel settings-panel-wide">
        <div class="prompt-head">
          <h3>系统提示词（Prompt 工程）</h3>
          <el-button link type="primary" @click="settings.resetSystemPrompt(serverDefaultPrompt)">恢复默认</el-button>
        </div>
        <el-input v-model="settings.systemPrompt" type="textarea" :rows="10" placeholder="自定义 RAG 系统提示词" />
        <div class="field-tip">改完点「保存到本地」，再去对话页提问即可生效。</div>
      </div>
    </div>
    <PlatformSettings />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PlatformSettings from '../components/PlatformSettings.vue'
import { clearKnowledgeBase, fetchSettings } from '../api/docs'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const serverDefaultPrompt = ref('')

function save() {
  settings.persist()
  ElMessage.success('已保存')
}

async function reload() {
  const res = await fetchSettings()
  serverDefaultPrompt.value = res.data.data.defaultSystemPrompt || ''
  await settings.hydrate()
  ElMessage.success('已同步服务端默认配置')
}

async function clearKb() {
  await ElMessageBox.confirm('将删除全部文档、切片和原文件，且不可恢复。确认？', '清空知识库', { type: 'warning' })
  await clearKnowledgeBase()
  ElMessage.success('知识库已清空')
}

reload().catch(() => undefined)
</script>

<style scoped>
.settings-page {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.settings-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.settings-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.settings-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow);
  color: var(--text);
}

.settings-panel-wide {
  grid-column: 1 / -1;
}

.settings-panel h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-family: var(--display);
}

.prompt-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.prompt-head h3 {
  margin: 0;
}

.field-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.switch-list {
  display: flex;
  flex-direction: column;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #e8edf3;
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-title {
  font-size: 14px;
  font-weight: 600;
}

.switch-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .settings-header {
    flex-direction: column;
  }
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
