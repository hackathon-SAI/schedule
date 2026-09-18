import 'dotenv/config'
import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { serve } from '@hono/node-server'
import { secureHeaders, cors, rateLimiter } from './src/middleware'
import eventRoutes from './src/routes/eventRoutes'
import authRoutes from './src/routes/AuthRoutes'

const app = new Hono()

app.use('*', secureHeaders())

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15分
  limit: 100, // 100リクエストまで
  standardHeaders: 'draft-6',
  keyGenerator: (c) => c.req.header('x-forwarded-for') || 'anonymous',
})

app.use('/api/*', limiter as any)

export default app

app.use('/api/*', cors({
  origin: 'https://schedule-eight-eta.vercel.app/',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// 各ルートの登録
app.route('/api/events', eventRoutes)
app.route('/api/auth', authRoutes) // -> /api/auth/signup , /api/auth/login

export const POST = handle(app)
export const GET = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)

const port = 5000
console.log(`Server running on port ${port}`)

serve({
  fetch: app.fetch,
  port: port,
  hostname: '0.0.0.0'
}, (info) => {
  console.log(`=================================`)
  console.log(`サーバーが正常に起動しました！`)
  console.log(`URL: http://localhost:${info.port}`)
  console.log(`=================================`)
})