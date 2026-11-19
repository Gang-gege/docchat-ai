import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { initDatabase, dbPathInfo } from './db/index.js'
import { migrateLegacyJsonIfNeeded } from './db/migrate-legacy.js'
import { errorHandler } from './middleware/error-handler.js'
import { chatRouter } from './routes/chat.js'
import { docsRouter } from './routes/docs.js'
import { healthRouter } from './routes/health.js'
import { platformRouter } from './routes/platform.js'
import { settingsRouter } from './routes/settings.js'
import { statsRouter } from './routes/stats.js'
import { ensureLibrary } from './store/library-store.js'

async function bootstrap() {
  await initDatabase()
  await migrateLegacyJsonIfNeeded()
  ensureLibrary()

  const app = express()
  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '2mb' }))

  app.use('/api', healthRouter)
  app.use('/api', settingsRouter)
  app.use('/api', statsRouter)
  app.use('/api', docsRouter)
  app.use('/api', chatRouter)
  app.use('/api', platformRouter)

  app.use(errorHandler)

  app.listen(env.port, () => {
    console.log(`[DocChat BFF] http://localhost:${env.port}`)
    console.log(`[DocChat BFF] db=${dbPathInfo()}`)
    console.log(`[DocChat BFF] embedding=${env.useLocalEmbedding ? 'local' : 'remote'}`)
  })
}

bootstrap().catch((err) => {
  console.error('[DocChat BFF] 启动失败', err)
  process.exit(1)
})
