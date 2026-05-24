import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './routers/_root.js'
import { createContext } from './context.js'

const PORT = Number(process.env.PORT) || 3000

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

const app = express()
app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))

app.listen(PORT, () => {
  console.log(`[asset-rise/api] listening on :${PORT}`)
})
