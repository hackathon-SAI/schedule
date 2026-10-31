import { OAuth2Client } from 'google-auth-library'
import { AppContext } from '../types/hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { sql } from '../config/db'
import { UserModel } from '../models/userModel'

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' // popup（Code Client）認証用のリダイレクト識別子
)

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set.')
  }
  return secret
}

export const AuthController = {
  async googleLogin(c: AppContext) {
    try {
      const { code } = await c.req.json()

      if (!code) {
        return c.json({ error: '認可コードが必要です' }, 400)
      }

      // 1. 認可コードを各種トークン（Access / Refresh / ID Token）と交換
      const { tokens } = await googleClient.getToken(code)
      googleClient.setCredentials(tokens)

      // 2. IDトークンからユーザー情報を取得
      if (!tokens.id_token) {
        return c.json({ error: 'IDトークンを取得できませんでした' }, 400)
      }

      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()

      if (!payload || !payload.email || !payload.email_verified) {
        return c.json({ error: '未検証の Google アカウントです' }, 400)
      }

      const googleId = payload.sub
      const email = payload.email!
      const name = payload.name || 'Google User'
      const picture = payload.picture || ''

      // 3. ユーザー検索または新規登録
      let user = await UserModel.findByGoogleId(googleId)
      if (!user && email) {
        user = await UserModel.findByEmail(email)
      }

      if (!user) {
        user = await UserModel.createGoogleUser(googleId, name, email, picture)
      }

      // 4. API連携用トークンを DB に格納
      await UserModel.updateGoogleTokens(user.id, {
        accessToken: tokens.access_token || null,
        refreshToken: tokens.refresh_token || null,
        expiryDate: tokens.expiry_date || null,
      })

      // 5. アプリ内認証用 JWT の発行と Cookie セット
      const token = await sign(
        {
          id: user.id,
          email: user.email,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24時間
        },
        getJwtSecret()
      )

      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/',
        maxAge: 60 * 60 * 24,
      })

      return c.json({
        message: 'Google 連携・ログインに成功しました',
        user: { id: user.id, name: user.name, email: user.email, picture: user.picture },
      })
    } catch (err) {
      console.error('Google 認証エラー:', err)
      return c.json({ error: 'Google 認証処理に失敗しました' }, 500)
    }
  },

  async getMe(c: AppContext) {
    const payload = c.get('jwtPayload')
    if (!payload) {
      return c.json({ error: '未認証のユーザーです' }, 401)
    }

    const user = await UserModel.findById(payload.id)
    if (!user) {
      return c.json({ error: 'ユーザーが見つかりません' }, 404)
    }

    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
      },
    })
  },

  async updateMe(c: AppContext, name: string) {
    const payload = c.get('jwtPayload')
    if (!payload) {
      return c.json({ error: '未認証のユーザーです' }, 401)
    }

    const user = await UserModel.updateName(payload.id, name)
    if (!user) {
      return c.json({ error: 'ユーザーが見つかりません' }, 404)
    }

    return c.json({
      message: 'ニックネームを更新しました',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
      },
    })
  },

  async deleteMe(c: AppContext) {
    const userId = c.get('jwtPayload').id
    const user = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `

    if (user.length === 0) {
      return c.json({ error: 'ユーザーが見つかりません' }, 404)
    }

    await sql.transaction([
      sql`
        UPDATE group_members gm
        SET role = 'admin'
        WHERE gm.user_id = (
          SELECT candidate.user_id
          FROM group_members candidate
          WHERE candidate.group_id = gm.group_id
            AND candidate.user_id <> ${userId}
          ORDER BY CASE WHEN candidate.role = 'admin' THEN 0 ELSE 1 END,
            candidate.user_id
          LIMIT 1
        )
          AND gm.group_id IN (
            SELECT group_id FROM group_members
            WHERE user_id = ${userId} AND role = 'admin'
          )
          AND NOT EXISTS (
            SELECT 1 FROM group_members other_member
            WHERE other_member.group_id = gm.group_id
              AND other_member.user_id <> ${userId}
              AND other_member.role = 'admin'
          )
      `,
      sql`
        UPDATE groups
        SET created_by = (
          SELECT candidate.user_id
          FROM group_members candidate
          WHERE candidate.group_id = groups.id
            AND candidate.user_id <> ${userId}
          ORDER BY CASE WHEN candidate.role = 'admin' THEN 0 ELSE 1 END,
            candidate.user_id
          LIMIT 1
        )
        WHERE created_by = ${userId}
          AND EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = groups.id AND user_id <> ${userId}
          )
      `,
      sql`DELETE FROM events WHERE created_by = ${userId}`,
      sql`DELETE FROM group_members WHERE user_id = ${userId}`,
      sql`
        DELETE FROM events
        WHERE group_id IN (
          SELECT g.id FROM groups g
          WHERE NOT EXISTS (
            SELECT 1 FROM group_members gm WHERE gm.group_id = g.id
          )
        )
      `,
      sql`
        DELETE FROM groups g
        WHERE NOT EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = g.id
        )
      `,
      sql`DELETE FROM users WHERE id = ${userId}`,
    ])

    deleteCookie(c, 'token', {
      path: '/',
      secure: true,
      sameSite: 'None',
    })
    return c.json({ message: 'アカウントと登録データを削除しました' })
  },

  async logout(c: AppContext) {
    deleteCookie(c, 'token', {
      path: '/',
      secure: true,
      sameSite: 'None',
    })
    return c.json({ message: 'ログアウトしました' })
  },
}