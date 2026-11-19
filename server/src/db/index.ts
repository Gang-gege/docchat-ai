import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')
const dbPath = path.join(root, 'docchat.sqlite')
const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')
const sqlJsDist = path.dirname(require.resolve('sql.js'))

let SQL: SqlJsStatic | null = null
let db: Database | null = null

function ensureDir() {
  fs.mkdirSync(root, { recursive: true })
}

function ensureColumn(database: Database, table: string, column: string, ddl: string) {
  const stmt = database.prepare(`PRAGMA table_info(${table})`)
  let exists = false
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: string }
    if (row.name === column) exists = true
  }
  stmt.free()
  if (!exists) database.run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

export function getDb(): Database {
  if (!db) throw new Error('数据库尚未初始化，请先调用 initDatabase()')
  return db
}

export function persistDb() {
  if (!db) return
  ensureDir()
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export async function initDatabase() {
  if (db) return db
  ensureDir()
  SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsDist, file),
  })
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(fileBuffer))
  } else {
    db = new SQL.Database()
  }
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)
  ensureColumn(db, 'documents', 'summary', "summary TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'documents', 'note', "note TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'documents', 'favorite', 'favorite INTEGER NOT NULL DEFAULT 0')
  persistDb()
  console.log(`[DB] SQLite ready -> ${dbPath}`)
  return db
}

export function dbPathInfo() {
  return dbPath
}
