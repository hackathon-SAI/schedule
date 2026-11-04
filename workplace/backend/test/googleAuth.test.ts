import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { createRequire } from 'module'
import { MemoryStore } from 'hono-rate-limiter'
import { createRequestRateLimiter } from '../src/middleware/rateLimit'
import { requireLoginOriginGuard } from '../src/middleware/authSecurity'

const require = createRequire(import.meta.url)

const ga = require('google-auth-library')
const mockOAuth2Client = class {
  getToken: any = async (param: any) => {
    const code = typeof param === 'string' ? param : param?.code
    if (code === 'valid-code') {
      return { tokens: { access_token: 'ya29.mock', id_token: 'mock-id-token', token_type: 'Bearer', expiry_date: Date.now() + 3600000 } }
    }
    if (code === 'invalid-code') {
      return { tokens: { access_token: 'ya29.mock', token_type: 'Bearer' } }
    }
    throw new Error('invalid_grant')
  }
  setCredentials: any = async () => {}
  verifyIdToken: any = async ({ idToken }: { idToken: string }) => {
    if (idToken === 'mock-id-token') {
      return { getPayload: () => ({ sub: '1234567890', email: 'testuser@example.com', email_verified: true, name: 'Test User', picture: 'https://example.com/photo.jpg' }) }
    }
    return { getPayload: () => ({ sub: '999', email: 'unverified@example.com', email_verified: false }) }
  }
}
Object.defineProperty(ga, 'OAuth2Client', { value: mockOAuth2Client, writable: true, configurable: true })

delete require.cache[require.resolve('../src/controllers/authController')]
const { AuthController } = require('../src/controllers/authController')

import { requireJsonContentType } from '../src/middleware/requestSecurity'

import { UserModel } from '../src/models/userModel'
import { AuditLogModel } from '../src/models/auditLogModel'

const mockUsers = new Map<string, any>()
let nextUserId = 1

UserModel.findByGoogleId = async (googleId: string) => mockUsers.get(googleId) || null
UserModel.findByEmail = async (email: string) => {
  for (const u of mockUsers.values()) if (u.email === email) return u
  return null
}
UserModel.createGoogleUser = async (googleId: string, name: string, email: string, picture: string) => {
  const user = { id: nextUserId++, email, google_id: googleId, name, picture, token_version: 0 }
  mockUsers.set(googleId, user)
  return user
}
UserModel.getTokenVersion = async (id: number) => {
  for (const u of mockUsers.values()) if (u.id === id) return u.token_version
  return null
}
UserModel.incrementTokenVersion = async (id: number) => {
  for (const u of mockUsers.values()) if (u.id === id) { u.token_version++; return u.token_version }
  return null
}
UserModel.updatePicture = async (id: number, picture: string) => {
  for (const u of mockUsers.values()) if (u.id === id) { u.picture = picture; return u }
  return null
}
UserModel.updateGoogleTokens = async () => {}

AuditLogModel.createFromContext = async (c: any, userId: number, eventType: string, details?: any) => ({
  id: 1, user_id: userId, event_type: eventType, event_details: details
})

process.env.JWT_SECRET = 'test-secret-key-for-testing-32chars-minimum-length'

function createApp() {
  const loginStore = new MemoryStore()
  const googleStore = new MemoryStore()
  const loginRateLimit = createRequestRateLimiter('login', 5, 60 * 1000, loginStore)
  const googleAuthRateLimit = createRequestRateLimiter('google-auth', 20, 15 * 60 * 1000, googleStore)

  const app = new Hono()
  app.use('*', requireJsonContentType)
  app.post('/auth/google', loginRateLimit, googleAuthRateLimit, requireLoginOriginGuard, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const code = body.code
    if (!code) return c.json({ error: '認可コード (code) が必要です' }, 400)
    return AuthController.googleLogin(c)
  })
  return app
}

test.beforeEach(() => { mockUsers.clear(); nextUserId = 1 })

test('Google login valid code', async () => {
  const app = createApp()
  const res = await app.request('/auth/google', {
    method: 'POST', headers: { Origin: 'https://schedule-sai.vercel.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'valid-code' }),
  })
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.ok(data.user?.id)
  assert.equal(data.user.email, 'testuser@example.com')
  const sc = res.headers.get('Set-Cookie')
  assert.ok(sc?.includes('token='))
})

test('Google login invalid code', async () => {
  const app = createApp()
  const res = await app.request('/auth/google', {
    method: 'POST', headers: { Origin: 'https://schedule-sai.vercel.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'invalid-code' }),
  })
  assert.equal(res.status, 400)
})

test('Google login missing code', async () => {
  const app = createApp()
  const res = await app.request('/auth/google', {
    method: 'POST', headers: { Origin: 'https://schedule-sai.vercel.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 400)
})

test('Google login rejects disallowed origin', async () => {
  const app = createApp()
  const res = await app.request('/auth/google', {
    method: 'POST', headers: { Origin: 'http://localhost:8765', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'valid-code' }),
  })
  assert.equal(res.status, 403)
})

test('Rate limit: 5 ok then 429', async () => {
  const app = createApp()
  for (let i = 0; i < 6; i++) {
    const res = await app.request('/auth/google', {
      method: 'POST', headers: { Origin: 'https://schedule-sai.vercel.app', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'valid-code' }),
    })
    assert.equal(res.status, i < 5 ? 200 : 429)
  }
})
