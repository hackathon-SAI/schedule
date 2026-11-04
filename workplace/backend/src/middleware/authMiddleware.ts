import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import { Env, JWTPayload } from '../types/hono.js'
import { UserModel } from '../models/userModel.js'
import { getJwtSecret } from '../controllers/authController.js'
import { sql } from '../config/db.js'

type TokenVersionLookup = (id: string | number) => Promise<number | null>

// JWT リプレイ検知用: 使用済み JTI を DB でチェック
async function isJtiUsed(jti: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM jwt_used_jtis WHERE jti = ${jti} AND expires_at > NOW()`
  return !!row
}

// JWT リプレイ検知用: JTI を使用済みとして記録
async function markJtiUsed(jti: string, exp: number): Promise<void> {
  await sql`INSERT INTO jwt_used_jtis (jti, expires_at) VALUES (${jti}, to_timestamp(${exp})) ON CONFLICT (jti) DO NOTHING`
}

// JWT 署名鍵のエントロピー検証 (R06)
export function validateJwtSecretEntropy(secret: string): void {
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  const uniqueChars = new Set(secret).size
  if (uniqueChars < 8) {
    throw new Error('JWT_SECRET must have sufficient entropy')
  }
  const weakPatterns = [
    /^[a-z]+$/i,
    /^[0-9]+$/,
    /^(.).\1+$/, // 同一文字繰り返し
    /^[a-f0-9]{32}$/i,
  ]
  for (const pattern of weakPatterns) {
    if (pattern.test(secret)) {
      throw new Error('JWT_SECRET is too weak')
    }
  }
}

export function createAuthCheck(
  getTokenVersion: TokenVersionLookup = UserModel.getTokenVersion
) {
  return async (c: Context<Env>, next: Next) => {
    const authorization = c.req.header('Authorization')
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined
    const token = bearerToken || getCookie(c, 'token')

    if (!token) {
      return c.json({ error: '認証トークンがありません' }, 401)
    }

    const secret = getJwtSecret()

    let payload: Awaited<ReturnType<typeof verify>>
    try {
      payload = await verify(token, secret, 'HS256')
    } catch (error) {
      console.error('JWT signature validation error:', error)
      return c.json({ error: '無効なトークンです' }, 401)
    }

    // JTI リプレイ検知 (R05)
    if (typeof payload.jti === 'string' && typeof payload.exp === 'number') {
      if (await isJtiUsed(payload.jti)) {
        return c.json({ error: 'リプレイ攻撃が検出されました' }, 401)
      }
      await markJtiUsed(payload.jti, payload.exp)
    }

    if (
      (typeof payload.id !== 'string' && typeof payload.id !== 'number') ||
      typeof payload.email !== 'string' ||
      typeof payload.exp !== 'number' ||
      (payload.mode !== 'demo' &&
        (typeof payload.token_version !== 'number' ||
          !Number.isSafeInteger(payload.token_version) ||
          payload.token_version < 0)) ||
      (payload.mode !== undefined && payload.mode !== 'demo') ||
      (payload.persona !== undefined && typeof payload.persona !== 'string')
    ) {
      return c.json({ error: '無効なトークンです' }, 401)
    }

    if (payload.mode !== 'demo') {
      const currentTokenVersion = await getTokenVersion(payload.id)
      if (currentTokenVersion === null || payload.token_version !== currentTokenVersion) {
        return c.json({ error: '無効なトークンです' }, 401)
      }
    }

    const jwtPayload: JWTPayload = {
      id: payload.id,
      email: payload.email,
      exp: payload.exp,
      ...(typeof payload.token_version === 'number'
        ? { tokenVersion: payload.token_version }
        : {}),
      ...(payload.mode === 'demo' ? { mode: 'demo' as const } : {}),
      ...(typeof payload.persona === 'string' ? { persona: payload.persona } : {}),
      ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}),
    }
    c.set('jwtPayload', jwtPayload)

    await next()
  }
}

export const authCheck = createAuthCheck()

export const rejectDemoAccess = async (c: Context<Env>, next: Next) => {
  const payload = c.get('jwtPayload')
  if (payload?.mode === 'demo') {
    return c.json({ error: 'デモモードでは既存データを変更できません。' }, 403)
  }
  await next()
}

// デモモードでの機密取得を遮断 (R17/R18)
export const rejectDemoSensitiveAccess = async (c: Context<Env>, next: Next) => {
  const payload = c.get('jwtPayload')
  if (payload?.mode === 'demo') {
    return c.json({ error: 'デモモードではこの操作はできません。' }, 403)
  }
  await next()
}
