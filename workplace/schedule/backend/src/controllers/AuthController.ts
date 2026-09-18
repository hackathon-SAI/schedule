import { Context } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import argon2 from 'argon2'
import crypto from 'crypto'
import { Resend } from 'resend'
import { sql } from '../config/db'
import { UserModel } from '../models/userModel'
import { TmpUserModel } from '../models/tmpUserModel'
import { SignupInput, LoginInput } from '../validators/authValidators'

const resend = new Resend(process.env.RESEND_API_KEY)

export const AuthController = {
  // 1. 仮登録 (POST /api/auth/signup)
  async signup(c: Context, data: SignupInput) {
    try {
      const { name, email, password } = data

      const existingUser = await UserModel.findByEmail(email)
      if (existingUser) {
        return c.json({ error: 'このメールアドレスは既に登録されています' }, 400)
      }

      const hash = await argon2.hash(password)
      const token = crypto.randomUUID()

      await TmpUserModel.create(name, email, hash, token)

      const verifyUrl = `${process.env.FRONTEND_URL || 'https://schedule-eight-eta.vercel.app/'}/verify?token=${token}`

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'アカウント認証のお願い',
        html: `<p>${name}様</p><p>以下のリンクをクリックして30分以内に本登録を完了してください。</p><a href="${verifyUrl}">${verifyUrl}</a>`
      })

      return c.json({ message: '確認メールを送信しました。30分以内に認証を完了してください。' }, 200)
    } catch (err) {
      console.error(err)
      return c.json({ error: '仮登録処理に失敗しました' }, 500)
    }
  },
  // 2. 本登録 (GET /api/auth/verify?token=xxxx)
  async verify(c: Context) {
    try {
      const token = c.req.query('token')
      if (!token) {
        return c.json({ error: 'トークンが指定されていません' }, 400)
      }

      const tmpUser = await TmpUserModel.findByToken(token)
      if (!tmpUser) {
        return c.json({ error: '無効なトークンか、有効期限が切れています' }, 400)
      }

      let newUser
      const [inserted] = await sql.transaction((tx) => [
        tx`
          INSERT INTO users (name, email, password_hash)
          VALUES (${tmpUser.name}, ${tmpUser.email}, ${tmpUser.password_hash})
          RETURNING id, name, email
        `,
        tx`
          DELETE FROM tmp_users WHERE id = ${tmpUser.id}
        `
      ])
      newUser = inserted[0]

      return c.json({ message: '本登録が完了しました！', user: newUser }, 201)
    } catch (err) {
      console.error(err)
      return c.json({ error: '本登録処理に失敗しました' }, 500)
    }
  },

  // 3. ログイン
  async login(c: Context, data: LoginInput) {
    try {
      const { email, password } = data

      const user = await UserModel.findByEmail(email)
      if (!user) {
        return c.json({ error: 'メールアドレスまたはパスワードが間違っています' }, 401)
      }

      const isValid = await argon2.verify(user.password_hash, password)
      if (!isValid) {
        return c.json({ error: 'メールアドレスまたはパスワードが間違っています' }, 401)
      }

      const secret = process.env.JWT_SECRET || 'fallback_secret'
      const token = await sign(
        {
          id: user.id,
          email: user.email,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
        },
        secret
      )

      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24
      })

      return c.json({
        message: 'ログインに成功しました',
        user: { id: user.id, name: user.name, email: user.email }
      })
    } catch (err) {
      console.error(err)
      return c.json({ error: 'サーバーエラーが発生しました' }, 500)
    }
  },

  // 4. ログアウト (POST /api/auth/logout)
  async logout(c: Context) {
    deleteCookie(c, 'token', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    })
    return c.json({ message: 'ログアウトしました' })
  },

  // 5. ログイン状態確認 (GET /api/auth/me)
  async getMe(c: Context) {
    const payload = c.get('jwtPayload')
    return c.json({ user: payload })
  }
}