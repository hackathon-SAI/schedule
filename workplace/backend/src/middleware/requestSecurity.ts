import type { MiddlewareHandler } from 'hono'
import 'dotenv/config'

const frontendUrl = process.env.FRONTEND_URL

// FRONTEND_URL が設定されていれば動的に使用、なければフォールバックとしてハードコード値を使用
const productionAllowedOrigins = Array.from(
  new Set([
    frontendUrl,
    'https://schedule-sai.vercel.app',
  ].filter((url): url is string => Boolean(url)))
)
const developmentAllowedOrigins = Array.from(
  new Set([
    ...productionAllowedOrigins,
    'http://127.0.0.1:8765',
    'http://localhost:8765',
  ])
)

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function getAllowedOrigins(environment = process.env.NODE_ENV): string[] {
  // 明示的に development の場合のみローカルオリジンを許可。
  // production または未設定の場合は本番オリジンのみを返す（CORS 資格情報付き応答の不正な許可を防ぐため）。
  return environment === 'development'
    ? [...developmentAllowedOrigins]
    : [...productionAllowedOrigins]
}

export function createOriginGuard(allowedOrigins: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('Origin')

    // OPTIONS (preflight) requests should pass through - CORS middleware handles them
    if (c.req.method === 'OPTIONS') {
      await next()
      return
    }

    // Reject missing Origin for state-changing methods (security best practice)
    if (stateChangingMethods.has(c.req.method) && !origin) {
      return c.json({ error: '許可されていないOriginからのリクエストです' }, 403)
    }

    if (origin) {
      if (!allowedOrigins.includes(origin)) {
        return c.json({ error: '許可されていないOriginからのリクエストです' }, 403)
      }
    }

    await next()
  }
}

// Content-Type検証：text/plain や multipart/form-data など非JSONリクエストを拒否
export const requireJsonContentType: MiddlewareHandler = async (c, next) => {
  const contentType = c.req.header('Content-Type')

  // OPTIONS (preflight) リクエストはContent-Typeなしでも許可
  if (c.req.method === 'OPTIONS') {
    await next()
    return
  }

  // State-changing リクエストでは Content-Type が必須
  if (stateChangingMethods.has(c.req.method) && !contentType) {
    return c.json({ error: 'Content-Typeはapplication/jsonである必要があります' }, 415)
  }

  // Content-Typeヘッダーがない場合はスキップ（GET 等）
  if (!contentType) {
    await next()
    return
  }

  const parsedContentType = contentType.split(';', 1)[0].trim().toLowerCase()

  if (parsedContentType !== 'application/json') {
    return c.json({ error: 'Content-Typeはapplication/jsonである必要があります' }, 415)
  }

  await next()
}
