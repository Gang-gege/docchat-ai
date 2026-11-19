# 接口文档（OpenAPI 3.0 风格）

Base URL：开发环境 `http://localhost:3000`，前端 Vite 将 `/api` 代理到该地址。

```yaml
openapi: 3.0.3
info:
  title: DocChat AI BFF API
  version: 0.1.0
  description: 私有文档知识库上传、管理与 SSE 流式问答
servers:
  - url: http://localhost:3000
```

## 通用响应

成功（非 SSE）：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {}
}
```

失败：

```json
{
  "code": 40001,
  "msg": "不支持的文件类型",
  "data": null
}
```

| code | 含义 |
| --- | --- |
| 0 | 成功 |
| 40001 | 参数 / 文件错误 |
| 40401 | 文档不存在 |
| 50000 | 服务内部错误 |

---

## GET /api/health

健康检查。

**Response 200**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "ok": true,
    "vectorBackend": "memory",
    "embedding": "local"
  }
}
```

---

## GET /api/settings

返回服务端默认可展示配置（**不含 API Key**）。

**Response 200**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "llmBaseUrl": "https://api.deepseek.com",
    "llmModel": "deepseek-chat",
    "temperature": 0.2,
    "topK": 4,
    "chunkSize": 800,
    "chunkOverlap": 120
  }
}
```

---

## POST /api/upload

上传文档并构建知识库。支持多文件，字段名 `files`。

**Request** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| files | File[] | 是 | `.md` / `.pdf`，单文件建议 < 20MB |

**Response 200**

```json
{
  "code": 0,
  "msg": "入库成功",
  "data": {
    "docs": [
      {
        "docId": "d_8f2a1c",
        "name": "产品手册.pdf",
        "chunkCount": 17,
        "size": 102400
      }
    ]
  }
}
```

兼容文档约定的简写字段：单文件成功时也可读取 `data.docs[0].docId`。

**错误**

- 未选择文件 → `40001`
- 扩展名不在白名单 → `40001`

---

## GET /api/docs

获取已上传文档列表。

**Response 200**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "list": [
      {
        "docId": "d_8f2a1c",
        "name": "产品手册.pdf",
        "ext": "pdf",
        "size": 102400,
        "chunkCount": 17,
        "createdAt": "2026-10-13T01:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

## DELETE /api/doc/{docId}

删除文档元数据及该文档在向量库中的全部切片。

**Path**

| 参数 | 说明 |
| --- | --- |
| docId | 入库时返回的文档 ID |

**Response 200**

```json
{
  "code": 0,
  "msg": "已删除",
  "data": { "docId": "d_8f2a1c" }
}
```

**错误**：文档不存在 → `40401`

---

## GET /api/stats

知识库统计（文档数、切片数、是否已配置 LLM 等）。

**Response 200**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "docCount": 2,
    "chunkCount": 26,
    "totalSize": 102400,
    "vectorBackend": "memory",
    "embedding": "local",
    "llmConfigured": false,
    "llmModel": "deepseek-chat",
    "recentDocs": []
  }
}
```

---

## POST /api/chat-stream（推荐）

SSE 流式问答。使用 `text/event-stream`。前端用 `fetch` + `ReadableStream` 消费，支持取消。

**Body JSON**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| question | string | 是 | 用户问题 |
| history | array | 否 | 多轮历史 `[{role, content}]` |
| topK | number | 否 | 召回条数 |
| temperature | number | 否 | 温度 |
| enableAgent | boolean | 否 | 默认 true |
| enableRewrite | boolean | 否 | 默认 true，多轮时查询改写 |
| scoreThreshold | number | 否 | 相似度阈值 |

**SSE 事件**

| event | data 示例 | 说明 |
| --- | --- | --- |
| status | `{"stage":"rewrite"}` | `agent` / `rewrite` / `retrieve` / `generate` |
| rewrite | `{"original","query"}` | 查询改写结果 |
| citations | `{"items":[...],"retrieveQuery"}` | 引用片段 |
| agent | `{"thought","tool","input","output"}` | Agent 日志 |
| token | `{"text":"..."}` | 答案增量 |
| done | `{"ok":true,"mode":"rag"}` | 结束 |
| error | `{"msg":"..."}` | 失败 |

另保留 `GET /api/chat-stream` 兼容旧版 EventSource（不便携带 history）。

---

## 错误处理约定

- REST 使用 JSON + HTTP 状态码（4xx / 5xx）
- SSE 在已建立连接后通过 `event: error` 通知，然后关闭连接
- 工具调用 JSON 非法时，Agent 记录错误并回退为纯 RAG 问答
