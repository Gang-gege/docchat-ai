# 数据库说明（SQLite）

## 为什么选 SQLite

| 选项 | 结论 |
| --- | --- |
| MySQL / PostgreSQL | 适合生产多用户，但本地演示要额外装服务 |
| MongoDB | 文档型友好，但对「切片 + 向量检索」并非最省事 |
| **SQLite** | 单文件、零运维、和 Node BFF 同进程，最适合本项目本地开发 / 简历演示 |

实现使用 **`sql.js`**（WebAssembly 版 SQLite），避免 Windows 上 `better-sqlite3` 需要 Python / 编译工具链的问题。

## 文件位置

| 路径 | 内容 |
| --- | --- |
| `server/data/docchat.sqlite` | 数据库文件（重启不丢） |
| `server/storage/{docId}/原文件名` | 上传的 PDF / Markdown 原件 |
| `server/uploads/` | multer 临时目录，入库后会删除临时文件 |

## 表结构

### documents

| 字段 | 说明 |
| --- | --- |
| doc_id | 主键 |
| name | 原始文件名 |
| ext | 扩展名 |
| size | 字节大小 |
| chunk_count | 切片数量 |
| storage_path | 磁盘上的原文件路径 |
| created_at | ISO 时间 |

### chunks

| 字段 | 说明 |
| --- | --- |
| id | 切片主键，如 `d_xxx_0` |
| doc_id | 外键 → documents |
| doc_name | 冗余文档名，便于检索展示 |
| content | 原文片段 |
| embedding | JSON 数组（向量） |
| created_at | ISO 时间 |

删除文档时会级联删除对应 chunks，并删除 `storage/{docId}` 目录。

## 与「向量库」的关系

当前版本把 Embedding 存在 SQLite 的 `chunks.embedding`，检索时在 Node 里做余弦相似度。  
这是教学友好的一体方案；生产可把向量迁到 PGVector / Milvus，元数据仍可用 SQLite/PG。
