import { Hono } from 'hono'
import type { Env } from '../types/hono'
import { setCookie } from 'hono/cookie'
import { AuthController } from '../controllers/authController'
import { DemoController } from '../controllers/demoController'
import { authCheck, rejectDemoAccess, rejectDemoSensitiveAccess } from '../middleware/authMiddleware'
import { rejectDemoWrite, rejectDemoReadSensitive } from '../middleware/demoGuard'
import { requireJsonContentType } from '../middleware/requestSecurity'
import { googleAuthRateLimit, loginRateLimit } from '../middleware/rateLimit'
import { requireLoginOriginGuard } from '../middleware/authSecurity'

export const authRoutes = new Hono<Env>()

// Google OAuth リダイレクト認証（GET方式）フロントエンドが window.location.href で遷移するためのエンドポイント
// Googleの承認画面へリダイレクトする
authRoutes.get(
  '/google',
  loginRateLimit,
  googleAuthRateLimit,
  async (c) => {
    // GoogleのOAuth2承認URLを構築
    // リダイレクトURIはBACKEND_URLを使用（Googleのコールバックエンドポイント）
    const backendUrl = (c.env as any).BACKEND_URL || process.env.BACKEND_URL || 'https://schedule-backend-navy.vercel.app'
    const redirectUri = `${backendUrl}/api/auth/google/callback`

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '')
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'openid email profile')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'select_account')

    // ブラウザをGoogleの承認画面へリダイレクト
    return c.redirect(authUrl.toString())
  }
)

// Google 認可コード (code) によるログイン（POST方式 - 既存のフロー）
authRoutes.post(
  '/google',
  loginRateLimit,
  googleAuthRateLimit,
  requireLoginOriginGuard,
  requireJsonContentType,
  async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const code = body.code

    if (!code) {
      return c.json({ error: '認可コード (code) が必要です' }, 400)
    }

    // AuthController の設計に合わせて `c`（Context）のみを渡す
    return AuthController.googleLogin(c)
  }
)

// Google OAuth リダイレクトフロー用コールバック（GET方式 - CORS回避）
// Google Identity Services の redirect_uri に指定されるエンドポイント
authRoutes.get(
  '/google/callback',
  loginRateLimit,
  googleAuthRateLimit,
  async (c) => {
    const code = c.req.query('code')
    const error = c.req.query('error')
    const state = c.req.query('state')

    const fallbackFrontend = (c.env as any).FRONTEND_URL || process.env.FRONTEND_URL || 'https://schedule-sai.vercel.app'
    let frontendUrl = fallbackFrontend
    if (state && (state.startsWith('https://schedule-sai') || state.startsWith('http://localhost') || state.startsWith('http://127.0.0.1'))) {
      frontendUrl = state.replace(/\/$/, '')
    }

    // Googleからエラーが返された場合
    if (error) {
      console.error('Google OAuth error:', error)
      return c.redirect(`${frontendUrl}/login.html?error=${encodeURIComponent(error)}`)
    }

    // 認可コードがない場合
    if (!code) {
      console.error('No authorization code received from Google')
      return c.redirect(`${frontendUrl}/login.html?error=missing_code`)
    }

    try {
      // 認可コードを処理してJWTとユーザー情報を取得
      const { user, token } = await AuthController.processGoogleCode(code)

      // Cookie を設定
      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/',
        maxAge: 60 * 60 * 24,
      })

      // フロントエンドの calendar.html にリダイレクト（トークンを URL パラメータとして渡す）
      return c.redirect(`${frontendUrl}/calendar.html?token=${token}`)
    } catch (err) {
      console.error('Google OAuth callback error:', err)
      return c.redirect(`${frontendUrl}/login.html?error=callback_failed`)
    }
  }
)

// ログイン中のユーザー情報取得
authRoutes.get('/me', authCheck, (c) => AuthController.getMe(c))

// プロフィールのニックネーム更新
authRoutes.patch(
  '/me',
  requireLoginOriginGuard,
  requireJsonContentType,
  authCheck,
  rejectDemoAccess,
  async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name || name.length > 50) {
      return c.json({ error: 'ニックネームは1〜50文字で入力してください' }, 400)
    }

    return AuthController.updateMe(c, name)
  }
)

// 会員登録の削除
authRoutes.delete(
  '/me',
  requireLoginOriginGuard,
  authCheck,
  rejectDemoAccess,
  (c) => AuthController.deleteMe(c)
)

// ログアウト
authRoutes.post(
  '/logout',
  requireLoginOriginGuard,
  authCheck,
  rejectDemoAccess,
  (c) => AuthController.logout(c)
)

// Google連携の解除
authRoutes.post(
  '/disconnect',
  requireLoginOriginGuard,
  authCheck,
  rejectDemoAccess,
  (c) => AuthController.disconnectGoogle(c)
)

// デモセッションの作成（パブリックエンドポイント - 認証不要）
authRoutes.post(
  '/demo/sessions',
  loginRateLimit,
  requireJsonContentType,
  (c) => DemoController.createSession(c)
)

// デモセッションの終了
authRoutes.post(
  '/demo/sessions/end',
  loginRateLimit,
  (c) => DemoController.endSession(c)
)

export default authRoutes
