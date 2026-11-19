PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  doc_name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
