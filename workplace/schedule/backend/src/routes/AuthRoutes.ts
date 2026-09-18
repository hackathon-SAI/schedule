import { Hono } from 'hono'
import { AuthController } from '../controllers/AuthController'
import { zValidator } from '@hono/zod-validator'
import { authCheck } from '../middleware/authMiddleware'
import { signupSchema, loginSchema } from '../validators/authValidators'

const authRoutes = new Hono()

// 公開ルート（Zodミドルウェアを適用）
authRoutes.post('/signup', async (c) => {
  const body = await c.req.json()
  const result = await signupSchema.safeParseAsync(body)
  if (!result.success) {
   const errors = result.error.issues.map((issue) => issue.message)
    return c.json({ errors }, 400)
  }

  return AuthController.signup(c, result.data)
})

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = await loginSchema.safeParseAsync(body)

  if (!result.success) {
    const errors = result.error.issues.map((issue) => issue.message)
    return c.json({ errors }, 400)
  }

  return AuthController.login(c, result.data)
})
export default authRoutes