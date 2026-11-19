# 开发计划（任务拆分）

建议按周推进。每项完成后应能独立演示。

## 第 1 周：工程骨架

- [x] 初始化 npm workspaces、前后端 TypeScript 工程
- [x] Express 健康检查、统一响应、错误中间件
- [x] Vue3 路由：知识库 / 对话 / 设置
- [x] Vite 代理 `/api`，联通 `GET /api/health`
- [ ] 补齐 `server/.env` 与 README 启动验证

**验收**：两端同时启动，设置页能读到默认模型名。

## 第 2 周：文档入库

- [x] multer 多文件上传，限制 md / pdf
- [x] Markdown / PDF 文本提取
- [x] RecursiveCharacterTextSplitter 切片
- [x] Embedding + 向量写入（内存默认，Chroma 可插拔）
- [x] 文档元数据列表与删除（同步删向量）

**验收**：上传一份手册后列表可见；删除后检索不再命中该文档。

## 第 3 周：RAG 问答 + SSE

- [x] 问题向量化与 TopK 检索
- [x] 约束 Prompt（禁止编造、无依据则说明）
- [x] `GET /api/chat-stream` 流式 token
- [x] 前端 EventSource 打字机渲染
- [x] 引用片段展示

**验收**：针对已上传内容提问能答到点；无关问题会拒绝编造。

## 第 4 周：Agent 与体验打磨

- [x] 工具 Schema：`getCurrentTime`、`getDocCount`、`listDocuments`、`searchKnowledge`
- [x] Function Calling 执行与回灌
- [x] SSE `agent` 事件与前端思考日志
- [x] 工具失败 / 非法 JSON 回退纯 RAG
- [x] 设置页参数覆盖 topK / temperature / 阈值 / 多轮 / 改写
- [x] 上下文长度截断（`MAX_CONTEXT_CHARS`）

**验收**：问「现在几点」「有哪些文档」会走工具；问文档内容仍走 RAG。

## 第 5 周：进阶能力（已落地一版）

- [x] 多会话管理 + 多轮历史
- [x] 查询改写（Query Rewrite）
- [x] POST 流式 + 停止生成
- [x] Markdown 回答渲染
- [x] 知识库统计面板
- [ ] 对接真实 Embedding / Chroma
- [ ] 按 [resume.md](./resume.md) 整理演示录屏
- [ ] 记录真实踩坑到 [notes.md](./notes.md)

## 里程碑演示脚本（约 3 分钟）

1. 打开设置，展示 OpenAI 兼容配置
2. 上传一份产品手册 PDF
3. 问手册内问题，展示流式答案 + 引用
4. 问无关问题，展示「文档中未找到」
5. 问当前时间 / 文档数量，展示 Agent 日志
6. 删除文档，再问同一问题，答案应失效
