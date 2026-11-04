import { OAuth2Client } from 'google-auth-library'
import { AppContext } from '../types/hono.js'
import { setCookie, deleteCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { sql } from '../config/db.js'
import { UserModel } from '../models/userModel.js'
import { AuditLogModel } from '../models/auditLogModel.js'
import { validateJwtSecretEntropy } from '../middleware/authMiddleware.js'
import { createProfileAvatar, isGeneratedProfileAvatar, encryptToken } from '../utils/profileAvatar'

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' // popup（Code Client）認証用のリダイレクト識別子
)

const INVALID_JWT_SECRETS = new Set([
  'your-secret-key',
  'your_jwt_secret',
  'jwt_secret',
  'secret',
  'changeme',
  'change-me',
  'default',
  'test',
  'test-secret',
])

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set.')
  }

  // 既知のサンプル値/弱い値をブロック（全環境）
  if (INVALID_JWT_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      'FATAL: JWT_SECRET cannot be a default/sample value. ' +
      'Generate a secure secret with: openssl rand -hex 32'
    )
  }

  // 本番環境では最小長 32 文字を強制（HS256 では 256-bit = 32 bytes 推奨）
  const isProduction =
  // エントロピー検証（長さ・文字多様性・弱いパターンを統一的にチェック）
  validateJwtSecretEntropy(secret);

    process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  if (isProduction && secret.length < 32) {
    throw new Error(
      `FATAL: JWT_SECRET must be at least 32 characters long (current: ${secret.length}). ` +
      `Generate a secure secret with: openssl rand -hex 32`
    )
  }

  return secret
}

// Google トークンの無効化・削除
async function revokeGoogleTokens(userId: number): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${userId}`
}

export const AuthController = {
  /**
   * Google 認可コードを処理し、ユーザー情報とJWTトークンを返す
   * レスポンス送信は行わない（呼び出し側で処理）
   */
  async processGoogleCode(code: string): Promise<{ user: any; token: string }> {
    // 1. 認可コードを各種トークン（Access / Refresh / ID Token）と交換
    const backendUrl = process.env.BACKEND_URL || 'https://schedule-backend-navy.vercel.app'
    const redirectUri = `${backendUrl}/api/auth/google/callback`
    const { tokens } = await googleClient.getToken({ code, redirect_uri: redirectUri })
    googleClient.setCredentials(tokens)

    // 2. IDトークンからユーザー情報を取得
    if (!tokens.id_token) {
      const err = new Error('IDトークンを取得できませんでした')
      ;(err as any).statusCode = 400
      throw err
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()

    if (!payload || !payload.email || !payload.email_verified) {
      throw new Error('未検証の Google アカウントです')
    }

    const googleId = payload.sub
    const email = payload.email!
    const name = payload.name || 'Google User'
    // 3. ユーザー検索または新規登録
    let user = await UserModel.findByGoogleId(googleId)
    if (!user && email) {
      user = await UserModel.findByEmail(email)
    }

    if (!user) {
      user = await UserModel.createGoogleUser(googleId, name, email, '')
    }

    if (!isGeneratedProfileAvatar(user.picture)) {
      const picture = createProfileAvatar(String(user.id))
      const updatedUser = await UserModel.updatePicture(user.id, picture)
      if (!updatedUser) {
        throw new Error('ユーザーのプロフィール画像を保存できませんでした')
      }
      user = updatedUser
    }

    // 4. API連携用トークンを暗号化して DB に格納 (R11)
    await UserModel.updateGoogleTokens(user.id, {
      accessToken: encryptToken(tokens.access_token || ''),
      refreshToken: encryptToken(tokens.refresh_token || ''),
      expiryDate: tokens.expiry_date || null,
    })

    const tokenVersion = await UserModel.getTokenVersion(user.id)
    if (tokenVersion === null) {
      throw new Error('ユーザーのトークン世代を取得できませんでした')
    }

    // 5. アプリ内認証用 JWT の発行
    const token = await sign(
      {
        id: user.id,
        email: user.email,
        token_version: tokenVersion,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24時間
      },
      getJwtSecret()
    )

    return { user, token }
  },

  async googleLogin(c: AppContext) {
    try {
      const { code } = await c.req.json()

      if (!code) {
        return c.json({ error: '認可コードが必要です' }, 400)
      }

      const { user, token } = await AuthController.processGoogleCode(code)

      // 監査ログ: ログイン成功
      await AuditLogModel.createFromContext(c, user.id, 'login', {
        method: 'google',
        user_email: user.email,
      })

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
    } catch (err: any) {
      console.error('Google 認証エラー:', err)

      if (err?.statusCode === 400) {
        return c.json({ error: 'Google 認証に失敗しました' }, 400)
      }

      const isProduction =
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

      if (isProduction) {
        return c.json({ error: 'Internal Server Error' }, 500)
      }

      return c.json({ error: 'Google 認証に失敗しました' }, 500)
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

    c.header('Cache-Control', 'no-store')
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

    // 監査ログ: アカウント削除前の状態記録
    const [userRow] = await sql`SELECT email, name FROM users WHERE id = ${userId}`
    await AuditLogModel.createFromContext(c, userId as number, 'delete_account', {
      deleted_email: userRow?.email,
      deleted_name: userRow?.name,
    })

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
          INNER JOIN group_members gm ON gm.group_id = g.id
          WHERE gm.user_id = ${userId}
            AND NOT EXISTS (
              SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id
            )
        )
      `,
      sql`
        DELETE FROM groups g
        WHERE EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = ${userId}
        )
          AND NOT EXISTS (
            SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id
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
    const payload = c.get('jwtPayload')
    if (payload.tokenVersion === undefined) {
      return c.json({ error: '無効なトークンです' }, 401)
    }

    // 監査ログ: ログアウト
    await AuditLogModel.createFromContext(c, payload.id as number, 'logout', {
      user_email: payload.email,
    })

    // トークン世代を increment して古い JWT を無効化
    const updatedVersion = await UserModel.incrementTokenVersion(payload.id as number)
    if (updatedVersion === null) {
      return c.json({ error: 'ユーザーが見つかりません' }, 401)
    }

    // Google トークンの無効化・削除
    await revokeGoogleTokens(payload.id as number)

    deleteCookie(c, 'token', {
      path: '/',
      secure: true,
      sameSite: 'None',
    })
    return c.json({ message: 'ログアウトしました' })
  },

  // Google連携の解除（トークンの完全削除とリフレッシュ）
  async disconnectGoogle(c: AppContext) {
    const userId = c.get('jwtPayload').id

    // Google トークンの完全削除
    await revokeGoogleTokens(userId as number)

    // Cookie 削除
    deleteCookie(c, 'token', {
      path: '/',
      secure: true,
      sameSite: 'None',
    })

    // トークン世代を increment して既存の JWT を無効化
    await UserModel.incrementTokenVersion(userId as number)

    return c.json({
      message: 'Google連携を解除しました。トークンを破棄し、再ログインが必要です。',
    })
  },
}
