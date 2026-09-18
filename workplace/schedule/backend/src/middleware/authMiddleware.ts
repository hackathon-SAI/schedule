import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'

const secret = process.env.JWT_SECRET || 'your-secret-key'

export const authCheck = async (c: Context, next: Next) => {
  try {
    const token = getCookie(c, 'token')

    if (!token) {
      return c.json({ error: '認証トークンが存在しません。ログインしてください' }, 401)
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret'
    const payload = await verify(token, secret, 'HS256')

    // Context にユーザー情報を保持して次の処理へ渡す
    c.set('jwtPayload', payload)
    await next()
  } catch (error) {
    return c.json({ error: '無効または期限切れのトークンです' }, 401)
  }
}