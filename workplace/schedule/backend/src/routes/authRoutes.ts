import { Hono } from 'hono'
import { Env } from '../types/hono'
import { AuthController } from '../controllers/AuthController'
import { authCheck } from '../middleware/authMiddleware'
import { signupSchema, loginSchema } from '../validators/authValidators'

const authRoutes = new Hono<Env>()

authRoutes.get('/me', authCheck, AuthController.getMe)

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

authRoutes.post('/google', async (c) => {
  const { credential } = await c.req.json().catch(() => ({}))

  if (!credential) {
    return c.json({ error: 'Google クライアント認証情報が必要です' }, 400)
  }

  return AuthController.googleLogin(c, credential)
})
export default authRoutes