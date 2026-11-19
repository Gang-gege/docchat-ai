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
  persistDb()
  console.log(`[DB] SQLite ready -> ${dbPath}`)
  return db
}

export function dbPathInfo() {
  return dbPath
}
