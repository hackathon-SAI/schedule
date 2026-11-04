import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import {
  createOriginGuard,
  getAllowedOrigins,
  requireJsonContentType,
} from '../src/middleware/requestSecurity'

function createApp() {
  const app = new Hono()
  app.use('*', createOriginGuard(getAllowedOrigins('production')))
  app.post('/write', requireJsonContentType, (c) => c.json({ ok: true }))
  app.put('/write', requireJsonContentType, (c) => c.json({ ok: true }))
  app.patch('/write', requireJsonContentType, (c) => c.json({ ok: true }))
  app.delete('/write', (c) => c.json({ ok: true }))
  return app
}

test('production allows only the frontend origin', () => {
  assert.deepEqual(getAllowedOrigins('production'), [
    'https://schedule-sai.vercel.app',
  ])
})

test('rejects disallowed and missing origins on every state-changing method', async () => {
  const app = createApp()
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const body = method === 'DELETE' ? undefined : '{}'
    const headers: Record<string, string> = {}
    if (method !== 'DELETE') headers['Content-Type'] = 'application/json'
    const disallowed = await app.request('/write', {
      method,
      headers: { Origin: 'http://localhost:8765', ...headers },
      body,
    })
    const missing = await app.request('/write', {
      method,
      headers,
      body,
    })

    assert.equal(disallowed.status, 403, `${method} should reject a disallowed origin`)
    assert.equal(missing.status, 403, `${method} should reject a missing origin`)
  }
})

test('rejects non-JSON request bodies and accepts application/json', async () => {
  const app = createApp()
  const text = await app.request('/write', {
    method: 'POST',
    headers: {
      Origin: 'https://schedule-sai.vercel.app',
      'Content-Type': 'text/plain',
    },
    body: '{}',
  })
  const json = await app.request('/write', {
    method: 'POST',
    headers: {
      Origin: 'https://schedule-sai.vercel.app',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: '{}',
  })

  assert.equal(text.status, 415)
  assert.equal(json.status, 200)
})

test('does not require a JSON content type for bodyless DELETE requests', async () => {
  const response = await createApp().request('/write', {
    method: 'DELETE',
    headers: { Origin: 'https://schedule-sai.vercel.app' },
  })

  assert.equal(response.status, 200)
})
