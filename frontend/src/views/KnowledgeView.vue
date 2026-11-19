<template>
  <section class="page-card knowledge-page">
    <header class="kb-header">
      <div>
        <h1 class="page-title">知识库管理</h1>
        <p class="kb-desc">支持 PDF / Markdown / TXT。上传后写入 SQLite（documents + chunks）并保存原文件。</p>
      </div>
      <div class="kb-actions">
        <el-input v-model="keyword" clearable placeholder="搜索文档名" style="width: 220px" @change="refresh" />
        <el-button @click="refresh">刷新</el-button>
        <el-button type="danger" plain :disabled="!selectedIds.length" @click="handleBatchDelete">
          批量删除 ({{ selectedIds.length }})
        </el-button>
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
        <div class="stat-num">{{ formatSize(stats.totalSize) }}</div>
        <div class="stat-label">总大小</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ stats.llmConfigured ? '已配置' : '未配置' }}</div>
        <div class="stat-label">LLM · {{ stats.db || 'sqlite' }}</div>
      </div>
    </div>

    <el-upload
      drag
      multiple
      :auto-upload="false"
      accept=".md,.markdown,.pdf,.txt"
      :on-change="onFileChange"
      :file-list="fileList"
      style="margin: 8px 0 16px"
    >
      <div class="el-upload__text">拖拽或点击上传（支持多文件）</div>
    </el-upload>

    <el-button type="primary" :loading="uploading" :disabled="!pendingFiles.length" @click="handleUpload">
      开始入库
    </el-button>

    <el-table
      :data="docs"
      style="margin-top: 18px"
      empty-text="暂无文档，请先上传"
      @selection-change="onSelect"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column prop="name" label="文档名称" min-width="220" show-overflow-tooltip />
      <el-table-column prop="ext" label="类型" width="80" />
      <el-table-column label="大小" width="110">
        <template #default="{ row }">{{ formatSize(row.size) }}</template>
      </el-table-column>
      <el-table-column prop="chunkCount" label="切片数" width="90" />
      <el-table-column prop="createdAt" label="入库时间" min-width="170" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row.docId)">详情</el-button>
          <el-button link @click="askAbout(row.name)">提问</el-button>
          <el-button link @click="handleDownload(row)">下载</el-button>
          <el-button link @click="handleReindex(row.docId)">重索引</el-button>
          <el-button link type="danger" @click="handleDelete(row.docId)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="detailVisible" title="文档详情与切片" size="520px">
      <template v-if="detail">
        <p><b>名称：</b>{{ detail.doc.name }}</p>
        <p><b>切片：</b>{{ detail.doc.chunkCount }} · <b>原文件：</b>{{ detail.hasFile ? '已保存' : '缺失' }}</p>
        <el-divider />
        <div v-for="(c, i) in detail.chunks" :key="c.id" class="chunk-card">
          <div class="chunk-title">#{{ i + 1 }} · {{ c.id }}</div>
          <pre>{{ c.content }}</pre>
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type UploadFile, type UploadUserFile } from 'element-plus'
import {
  batchDeleteDocs,
  deleteDoc,
  downloadDoc,
  fetchDocDetail,
  fetchDocs,
  fetchStats,
  reindexDoc,
  uploadDocs,
} from '../api/docs'
import type { DocItem, KnowledgeStats } from '../types'

const router = useRouter()
const docs = ref<DocItem[]>([])
const stats = ref<KnowledgeStats | null>(null)
const keyword = ref('')
const fileList = ref<UploadUserFile[]>([])
const pendingFiles = ref<File[]>([])
const uploading = ref(false)
const selectedIds = ref<string[]>([])
const detailVisible = ref(false)
const detail = ref<{
  doc: DocItem
  chunks: Array<{ id: string; content: string }>
  hasFile: boolean
} | null>(null)

function onFileChange(_file: UploadFile, list: UploadUserFile[]) {
  fileList.value = list
  pendingFiles.value = list.map((f) => f.raw).filter((f): f is File => Boolean(f))
}

function onSelect(rows: DocItem[]) {
  selectedIds.value = rows.map((r) => r.docId)
}

async function refresh() {
  const [docsRes, statsRes] = await Promise.all([fetchDocs(keyword.value), fetchStats()])
  docs.value = docsRes.data.data.list
  stats.value = statsRes.data.data
}

async function handleUpload() {
  uploading.value = true
  try {
    await uploadDocs(pendingFiles.value)
    ElMessage.success('入库成功')
    fileList.value = []
    pendingFiles.value = []
    await refresh()
  } finally {
    uploading.value = false
  }
}

async function handleDelete(docId: string) {
  await ElMessageBox.confirm('将删除文档、切片与原文件，是否继续？', '删除文档', { type: 'warning' })
  await deleteDoc(docId)
  ElMessage.success('已删除')
  await refresh()
}

async function handleBatchDelete() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds.value.length} 个文档？`, '批量删除', { type: 'warning' })
  await batchDeleteDocs(selectedIds.value)
  ElMessage.success('批量删除完成')
  selectedIds.value = []
  await refresh()
}

async function openDetail(docId: string) {
  const res = await fetchDocDetail(docId)
  detail.value = res.data.data
  detailVisible.value = true
}

async function handleDownload(row: DocItem) {
  try {
    await downloadDoc(row.docId, row.name)
  } catch {
    ElMessage.error('下载失败：原文件可能不存在（旧数据迁移前上传的）')
  }
}

async function handleReindex(docId: string) {
  await reindexDoc(docId)
  ElMessage.success('重索引完成')
  await refresh()
}

function askAbout(name: string) {
  sessionStorage.setItem('docchat-prefill', `「${name}」主要讲解了哪些内容？`)
  router.push('/chat')
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(refresh)
</script>

<style scoped>
.kb-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.kb-desc {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.kb-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.chunk-card {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.04);
}
.chunk-title {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.chunk-card pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 900px) {
  .kb-header {
    flex-direction: column;
  }
}
</style>
