# 项目目录结构

```text
Ai-Project/
├── README.md
├── package.json                      # npm workspaces 根配置
├── .env.example                      # 环境变量模板
├── .gitignore
├── docs/
│   ├── directory-structure.md        # 本文件
│   ├── tech-stack.md
│   ├── api.md
│   ├── development-plan.md
│   ├── resume.md
│   └── notes.md
├── frontend/                         # Vue3 + Vite
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── env.d.ts
│       ├── router/index.ts
│       ├── stores/
│       │   ├── settings.ts           # LLM / RAG 运行参数
│       │   └── chat.ts               # 会话与消息
│       ├── api/
│       │   ├── http.ts               # Axios 实例
│       │   ├── docs.ts
│       │   └── chat.ts               # EventSource SSE
│       ├── types/index.ts
│       ├── styles/global.css
│       ├── layouts/AppLayout.vue
│       └── views/
│           ├── KnowledgeView.vue
│           ├── ChatView.vue
│           └── SettingsView.vue
└── server/                           # Express BFF
    ├── package.json
    ├── tsconfig.json
    ├── .env                          # 本地配置（不入库）
    └── src/
        ├── index.ts                  # 入口、中间件、路由挂载
        ├── config/env.ts
        ├── types/index.ts
        ├── middleware/error-handler.ts
        ├── routes/
        │   ├── health.ts
        │   ├── docs.ts
        │   ├── chat.ts
        │   └── settings.ts
        ├── prompts/rag.ts
        ├── tools/
        │   ├── index.ts
        │   ├── getCurrentTime.ts
        │   └── getDocCount.ts
        ├── lib/
        │   ├── embeddings.ts         # OpenAI 兼容 / 本地简易向量
        │   ├── llm.ts                # Chat Completions + 流式
        │   └── splitter.ts
        ├── store/
        │   ├── document-store.ts     # 文档元数据 JSON
        │   └── vector-store.ts       # 内存向量 / Chroma 适配
        └── services/
            ├── ingest.service.ts     # 解析 + 切片 + 入库
            ├── rag.service.ts
            └── agent.service.ts
```

## 分层约定

| 层 | 职责 | 禁止事项 |
| --- | --- | --- |
| `routes/` | 参数校验、HTTP / SSE 协议 | 不写切片、检索、Prompt 细节 |
| `services/` | 业务编排（入库、RAG、Agent） | 不直接 `res.write` 业务无关逻辑 |
| `lib/` | LLM、Embedding、切分器等可复用能力 | 不依赖 Express `req/res` |
| `store/` | 文档元数据与向量持久化抽象 | 不调用 LLM |
| `tools/` | Agent 可执行函数及 JSON Schema | 不直接读 HTTP |

前端页面只通过 `src/api` 访问 BFF，设置项存 Pinia + `localStorage`，请求问答时作为 query 覆盖服务端默认 `topK` / `temperature`。
