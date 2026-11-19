# 简历项目描述（精简版）

## 一句话

基于 Vue3 + Node.js BFF 的私有文档智能问答系统，用 RAG 把 PDF / Markdown 建成可溯源知识库，并实现简易 Function Calling Agent。

## 项目描述（可直接粘贴）

**DocChat AI 私有文档智能问答系统**  
技术栈：Vue3、TypeScript、Vite、Element Plus、Express、LangChain JS、OpenAI 兼容 LLM、Chroma / 内存向量库

- 设计并实现文档入库链路：上传解析 → 文本切片 → Embedding → 向量检索，支持 PDF / Markdown 多文件管理与删除同步清向量
- 基于 RAG + 约束 Prompt 完成知识库问答，回答限定在召回片段内并展示原文引用，降低幻觉
- 实现多轮对话记忆与查询改写（Query Rewrite），缓解指代不清导致的召回偏差；支持相似度阈值与上下文截断
- 使用 POST + fetch SSE 流式输出、可中断生成；前端多会话管理、Markdown 渲染、阶段状态与引用折叠
- 实现 Agent Function Calling：时间、文档统计、文档清单、关键词检索等工具，失败自动回退 RAG
- 采用 BFF 架构将 RAG / Agent 编排放在 Node 层；LLM 走 OpenAI 兼容协议，可切换 DeepSeek / 通义

## 量化 / 亮点（按实际数据替换括号）

- 通过调整 chunkSize / overlap / topK，将「问到文档有但答不上」的情况从（调试前）降到（调试后）
- 上下文截断策略避免超长手册触发 token 超限
- Agent 非法 JSON 回退纯 RAG，避免工具调用失败导致整轮对话中断

## 面试可讲的点

1. 为什么用 BFF 而不是浏览器直连 LLM（密钥、切片、检索都不能放前端）
2. RAG 比「把全文塞进 Prompt」好在哪里（token、噪声、可溯源）
3. 切片过大 / 过小分别会怎样，overlap 解决什么问题
4. SSE 为何用 GET + EventSource，和 fetch 读 stream 的取舍
5. Function Calling 的两轮调用：先出 tool_calls，再带 tool 结果生成
