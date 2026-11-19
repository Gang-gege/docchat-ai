# 技术选型说明

## 总体架构

```text
浏览器 (Vue3)
    │  REST + SSE
    ▼
Node BFF (Express + TypeScript)
    ├── 文档解析 / 切片 (LangChain TextSplitter)
    ├── Embedding（OpenAI 兼容 或 本地简易向量）
    ├── 向量检索（内存 / Chroma）
    ├── Prompt + LLM Chat Completions
    └── Agent 工具执行
            │
            ▼
     云上 LLM / Embedding API
```

BFF 把 RAG 与 Agent 留在 Node 层，前端只负责上传、对话渲染和配置。前端开发者可以在熟悉的 TypeScript 栈里完成整条 AI 链路，无需 Python 训练或本地部署大模型。

## 前端

| 选型 | 原因 |
| --- | --- |
| Vue 3 + Composition API + `<script setup>` | 与主流 Vue 业务项目一致，页面逻辑清晰 |
| TypeScript + Vite | 类型安全、开发启动快 |
| Element Plus | 上传、表格、表单、布局开箱即用 |
| Vue Router / Pinia | 知识库 / 对话 / 设置三页隔离；设置与会话可持久化 |
| Axios | REST 上传与列表 |
| `EventSource` | 原生 SSE，实现打字机效果；异常时由业务层关闭并提示 |

## BFF

| 选型 | 原因 |
| --- | --- |
| Express | 中间件生态成熟，SSE 用 `res.write` 即可 |
| TypeScript | 与前端同一语言，工具 Schema 可共享类型 |
| LangChain JS | 文档加载、RecursiveCharacterTextSplitter、Prompt 模板、Agent 编排有现成抽象 |
| OpenAI 兼容协议 | DeepSeek、通义、OpenAI 只改 `BASE_URL` / `MODEL` |
| pdf-parse | Node 侧解析 PDF 文本 |
| multer | `multipart/form-data` 多文件上传 |
| Chroma（可选） | 本地向量库，开发体验接近生产语义检索 |
| 内存向量库（默认） | 零依赖即可演示入库 / 检索；进程重启数据清空 |

## RAG 关键参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `CHUNK_SIZE` | 800 | 过大切片会引入噪声，过小会丢上下文 |
| `CHUNK_OVERLAP` | 120 | 避免句子被切断导致召回碎片化 |
| `TOP_K` | 4 | 召回条数，过大易撑爆 token |
| `MAX_CONTEXT_CHARS` | 6000 | 拼进 Prompt 的上下文上限 |

Prompt 约束：只根据上下文作答；找不到依据时明确说明；禁止编造；回答中提示可引用的片段编号。

## Agent

预置工具：

- `getCurrentTime`：返回 ISO 时间与本地可读时间
- `getDocCount`：返回当前知识库文档数与切片数

链路：用户问题 → LLM 判断是否 function call → BFF 校验参数并执行 → 观察结果回灌 → 最终自然语言答案。前端通过 SSE 事件 `agent` 展示判断与调用日志。

## 为何不用本地大模型

本项目目标是 **AI 应用层**：解析、切片、检索、Prompt、流式、工具调用。本地部署模型会显著提高机器与运维成本，且与简历中「前端主导全栈」的叙事不一致。
