import type { MiddlewareHandler } from 'hono'

import { getAllowedOrigins, requireJsonContentType } from './requestSecurity'

export const requireLoginOriginGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin')
  const allowed = getAllowedOrigins()
  if (origin && !allowed.includes(origin)) {
    return c.json({ error: '許可されていないOriginからのリクエストです' }, 403)
  }
  await next()
}

export const requireLoginContentType: MiddlewareHandler = async (c, next) => {
  const contentType = c.req.header('Content-Type')
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
