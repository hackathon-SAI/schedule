import { Hono } from 'hono'

// dotenv はローカル開発時のみ読み込み（Vercel では環境変数が直接提供される）
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv/config')
}
import { serve } from '@hono/node-server'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import { Env } from './src/types/hono.js'
import { createOriginGuard, getAllowedOrigins, requireJsonContentType } from './src/middleware/requestSecurity.js'
import { apiWriteRateLimit } from './src/middleware/rateLimit.js'
import { bodySizeLimit } from './src/middleware/bodyLimit.js'
import { getJwtSecret } from './src/controllers/authController.js';
import eventRoutes from './src/routes/eventRoutes.js'
import authRoutes from './src/routes/authRoutes.js'
import groupRoutes from './src/routes/groupRoutes.js'
import holidayRoutes from './src/routes/holidayRoutes.js'
import demoRoutes from './src/routes/demoRoutes.js'

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
const allowedOrigins = getAllowedOrigins()

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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    // f8: CORS プレフライト最大有効時間（ブラウザキャッシュ最適化）
    maxAge: 86400,
    // f9: 認証情報付きリクエストで露出するヘッダー
    exposeHeaders: ['Authorization'],
  }),
  createOriginGuard(allowedOrigins),
  apiWriteRateLimit,
  bodySizeLimit(),
  requireJsonContentType
)

// 3. エラーハンドラ
const ERROR_LOG_PREFIX = '★ サーバーエラー詳細'

app.onError((err, c) => {
  const errorId = Math.random().toString(36).slice(-8)
  console.error(`${ERROR_LOG_PREFIX} [errorId=${errorId}]:`, err)

  // Vercel 環境でも NODE_ENV が設定されない場合があるため VERCEL 変数もチェック
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

  if (isProduction) {
    return c.json(
      {
        error: 'Internal Server Error',
        errorId,
      },
      500
    )
  }

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
app.route('/api/calendar/holidays', holidayRoutes)
app.route('/api/demo', demoRoutes)
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

export default app
