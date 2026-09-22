import 'dotenv/config'
import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { serve } from '@hono/node-server'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import { Env } from './src/types/hono'
import eventRoutes from './src/routes/eventRoutes'
import authRoutes from './src/routes/authRoutes'

const app = new Hono<Env>()

// 1. セキュリティヘッダーの適用
app.use('*', secureHeaders())

// 2. CORSの設定（ルーター登録前に必ず配置）
app.use(
  '/api/*',
  cors({
    origin: process.env.FRONTEND_URL || 'https://schedule-eight-eta.vercel.app',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// 3. ルートの登録
app.route('/api/events', eventRoutes)
app.route('/api/auth', authRoutes)

// 4. Vercel サーバーレス用エクスポート
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)

// 5. ローカル開発環境用（npm run dev などの時だけ起動）
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 5000
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`開発用サーバーが起動しました: http://localhost:${info.port}`)
    }
  )
}

export default app