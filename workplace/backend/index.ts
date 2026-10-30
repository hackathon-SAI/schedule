import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import { Env } from './src/types/hono'
import { getJwtSecret } from './src/controllers/authController';
import eventRoutes from './src/routes/eventRoutes'
import authRoutes from './src/routes/authRoutes'
import groupRoutes from './src/routes/groupRoutes'

// 起動時に JWT_SECRET の未設定・短すぎる値を検知して即失敗させる
getJwtSecret()

const app = new Hono<Env>()

// 1. セキュリティヘッダー
app.use(
  '*',
  secureHeaders({
    crossOriginOpenerPolicy: 'unsafe-none',
  })
)

// 2. CORS設定
const allowedOrigins = [
  'https://schedule-sai.vercel.app',
]

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (origin && allowedOrigins.includes(origin)) {
        return origin
      }
      return null
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)
// 3. エラーハンドラ
app.onError((err, c) => {
  console.error('★ サーバーエラー詳細:', err)
  return c.json(
    {
      error: 'サーバー内部エラーが発生しました',
      message: err.message,
    },
    500
  )
})

// 4. APIルートの登録
app.route('/api/events', eventRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/groups', groupRoutes)
app.route('/api/users', authRoutes)

// 5. ローカル開発用サーバー起動
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 5000
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`開発用サーバー起動: http://localhost:${info.port}`)
    }
  )
}

// Vercel Serverless Functions 用 (fetch をそのままエクスポート)
export const GET = app.fetch
export const POST = app.fetch
export const PUT = app.fetch
export const DELETE = app.fetch
export const PATCH = app.fetch
export const OPTIONS = app.fetch

export default app