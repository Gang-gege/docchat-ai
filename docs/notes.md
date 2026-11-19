# 开发注意事项 & 踩坑记录

## 环境与密钥

- API Key **只放在 `server/.env`**，不要写进前端仓库或 query。设置页只保存 BaseURL、模型名、温度、topK 等非敏感项。
- DeepSeek / 通义需确认是否同时提供 Embedding。很多厂商 Chat 与 Embedding 端点不同，要拆开 `LLM_*` 与 `EMBEDDING_*`。
- `LLM_BASE_URL` 有的要带 `/v1`，有的 SDK 会自动补。对接失败时先用 curl 打 `chat/completions` 确认。

## 文档解析

- 扫描件 PDF 没有文字层，`pdf-parse` 会得到空文本。入库后应检查 `chunkCount === 0` 并提示用户。
- 中文 PDF 字体子集可能导致乱码，优先用可选中文字的导出 PDF。
- Markdown 里的图片不会进向量库，问答无法「看到」图，只能依赖图注文字。

## 切片与召回

- `chunkSize` 过小：答案被切碎，模型看到半句话。
- `chunkSize` 过大：TopK 里噪声多，关键句被稀释。
- 标题与正文被切断时，提高 `chunkOverlap` 比盲目加大 TopK 更有效。
- 内存向量库在进程重启后清空，演示前需重新上传。

## Embedding

- 本地简易向量仅用于跑通流程，语义检索质量明显弱于云上 Embedding。
- 问答与入库必须用 **同一套 Embedding**，否则相似度无意义。
- 向量维度不一致时（换模型后），需要清空集合并重新入库。

## SSE

- `EventSource` 不能自定义 Header，不能 POST。问题走 query 即可；超长问题需改成 fetch + ReadableStream。
- 代理超时：Vite / Nginx 要对 `/api/chat-stream` 关闭缓冲、拉长 timeout，否则流会被攒成一块。
- 必须设置 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`，并禁用 Nginx `proxy_buffering`。
- 前端要监听 `error` 事件并 `close()`，避免页面离开后连接泄漏。

## Agent

- 模型有时输出「看起来像 JSON」的 Markdown 代码块，解析前要剥掉 \`\`\` 围栏。
- 工具名必须与 Schema 完全一致，做好白名单，禁止模型瞎编工具。
- 问文档内容时不要强行走 Agent，先检索再决定，避免浪费一轮调用。

## Token 与费用

- 拼接上下文前按 `MAX_CONTEXT_CHARS` 截断，优先保留 score 高的 chunk。
- 流式输出不要在每个 token 上打全量日志。
- 开发时把 temperature 调低（0.1–0.3），知识问答更稳。

## 安全

- 上传白名单只开 md / pdf，限制体积。
- 删除接口校验 `docId` 格式，避免误删整库。
- 生产必须做用户隔离，当前版本是单机单知识库演示。

## 已知限制（当前骨架）

- 默认内存向量，不适合多实例部署。
- 对话历史仅存浏览器，刷新后仍在 localStorage，但不回传给模型做多轮记忆（可按扩展项补）。
- Chroma 适配器已留接口，需本地启动 Chroma 并填写 `CHROMA_URL` 后启用。
