import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import { AppContext, JWTPayload } from '../types/hono.js'
import { getJwtSecret } from './authController.js'
import { UserModel } from '../models/userModel.js'
import { sql } from '../config/db.js'

const demoCookie = 'demo_token'
const demoLifetimeSeconds = 30 * 60

const personas = {
  yuito: {
    name: 'ゆいと',
    email: 'yuito.kosen.demo@gmail.com',
    birthday: '2010-02-14',
    role: 'しっかり者の班長タイプ。実験レポートや制作課題を主導し、提出期限に追われがち。',
  },
  aoi: {
    name: 'あおい',
    email: 'aoi108.demo@gmail.com',
    birthday: '2009-08-22',
    role: 'マイペースな情報収集型。テスト対策ノートの共有や講義予定の確認が中心。',
  },
  haruhi: {
    name: 'はるひ',
    email: 'haruhi.kosen.demo@gmail.com',
    birthday: '2009-04-09',
    role: '効率重視の助け合いタイプ。課題の消化率が高く、進捗報告や過去問共有を担当。',
  },
  nami: {
    name: 'なみ',
    email: 'nami.kosen.demo@gmail.com',
    birthday: '2009-07-18',
    role: '部活と課題を両立中のムードメーカー。未完了の提出物が多く、仲間のリマインドを受ける。',
  },
} as const

type PersonaId = keyof typeof personas

function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && Object.hasOwn(personas, value)
}

async function getDemoPayload(c: AppContext): Promise<(JWTPayload & { persona: PersonaId }) | null> {
  const authorization = c.req.header('Authorization')
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined
  const token = bearerToken || getCookie(c, demoCookie)
  if (!token) return null

  try {
    const payload = await verify(token, getJwtSecret(), 'HS256')
    if (
      payload.mode !== 'demo' ||
      !isPersonaId(payload.persona) ||
      (typeof payload.id !== 'string' && typeof payload.id !== 'number') ||
      typeof payload.email !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    return {
      id: payload.id,
      email: payload.email,
      exp: payload.exp,
      mode: 'demo',
      persona: payload.persona,
    }
  } catch (error) {
    console.error('デモトークンの検証に失敗しました:', error)
    return null
  }
}

export const DemoController = {
  async createSession(c: AppContext) {
    const body: unknown = await c.req.json().catch(() => ({}))
    const personaId =
      typeof body === 'object' && body !== null && 'personaId' in body
        ? body.personaId
        : undefined
    if (!isPersonaId(personaId)) {
      return c.json({ error: '選択されたデモプロフィールは利用できません。' }, 400)
    }

    const persona = personas[personaId]
    const user = await UserModel.findByEmail(persona.email)
    if (!user) {
      return c.json({ error: 'このデモアカウントはまだ利用できません。' }, 404)
    }

    // デモ用グループを取得または作成
    let [demoGroup] = await sql`
      SELECT id, name FROM groups WHERE is_demo = true AND created_by = ${user.id}
      ORDER BY id DESC LIMIT 1
    `

    if (!demoGroup) {
      const inviteCode = randomBytes(16).toString('hex').toUpperCase()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const created = await sql`
        INSERT INTO groups (name, invite_code, invite_code_expires_at, created_by, is_demo)
        VALUES (${persona.name + 'のデモグループ'}, ${inviteCode}, ${expiresAt}, ${user.id}, true)
        RETURNING id, name
      `
      demoGroup = created[0]

      await sql`
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (${demoGroup.id}, ${user.id}, 'admin')
        ON CONFLICT (group_id, user_id) DO NOTHING
      `
    }

    const token = await sign(
      {
        id: user.id,
        email: user.email,
        mode: 'demo',
        persona: personaId,
        exp: Math.floor(Date.now() / 1000) + demoLifetimeSeconds,
      },
      getJwtSecret()
    )

    setCookie(c, demoCookie, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/',
      maxAge: demoLifetimeSeconds,
    })
    c.header('Cache-Control', 'no-store')
    return c.json({
      message: 'デモを開始しました',
      sessionToken: token,
      user: { name: persona.name },
      groupId: demoGroup.id,  // デモ用グループIDを追加
    })
  },

  async getSession(c: AppContext) {
    const payload = await getDemoPayload(c)
    if (!payload || !isPersonaId(payload.persona)) {
      return c.json({ error: 'デモセッションがありません。' }, 401)
    }

    const persona = personas[payload.persona]
    const user = await UserModel.findById(payload.id)
    if (!user || user.email !== persona.email) {
      return c.json({ error: 'デモアカウントが見つかりません。' }, 401)
    }
    const groups = await sql`
      SELECT g.id, g.name, gm.role
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ${user.id} AND g.is_demo = true
      ORDER BY g.id DESC
    `
    const events = await sql`
      SELECT
        e.*,
        g.name AS group_name,
        creator.name AS creator_name,
        editor.name AS editor_name
      FROM events e
      JOIN groups g ON g.id = e.group_id
      JOIN group_members gm ON gm.group_id = g.id
      LEFT JOIN users creator ON creator.id = e.created_by
      LEFT JOIN users editor ON editor.id = e.updated_by
      WHERE gm.user_id = ${user.id}
      ORDER BY e.start_time ASC
    `
    const profileUsers = await sql`
      SELECT id, email
      FROM users
      WHERE email = ${personas.yuito.email}
        OR email = ${personas.aoi.email}
        OR email = ${personas.haruhi.email}
        OR email = ${personas.nami.email}
    `
    const taskCounts = await sql`
      SELECT created_by, COUNT(*)::int AS task_count
      FROM events
      WHERE description LIKE '[課題]%'
        AND created_by IN (
          SELECT id
          FROM users
          WHERE email = ${personas.yuito.email}
            OR email = ${personas.aoi.email}
            OR email = ${personas.haruhi.email}
            OR email = ${personas.nami.email}
        )
      GROUP BY created_by
    `
    const taskCountByUser = new Map(
      taskCounts.map((row) => [String(row.created_by), Number(row.task_count)])
    )
    const profileUserIds = new Map(
      profileUsers.map((profileUser) => [profileUser.email, String(profileUser.id)])
    )
    const profiles = Object.entries(personas).map(([id, profile]) => ({
      id,
      name: profile.name,
      email: profile.email,
      birthday: profile.birthday,
      role: profile.role,
      taskCount: taskCountByUser.get(profileUserIds.get(profile.email) || '') || 0,
    }))

    c.header('Cache-Control', 'no-store')
    return c.json({
      user: {
        id: user.id,
        name: persona.name,
        email: user.email,
      },
      groups,
      events,
      profiles,
    })
  },

  async previewGroup(c: AppContext) {
    const payload = await getDemoPayload(c)
    if (!payload || !isPersonaId(payload.persona)) {
      return c.json({ error: 'デモセッションがありません。' }, 401)
    }

    const inviteCode = (c.req.param('inviteCode') || '').trim().toUpperCase()
    if (!inviteCode || inviteCode.length > 32) {
      return c.json({ error: '招待コードが不正です。' }, 400)
    }

    const [group] = await sql`
      SELECT g.id, g.name, g.invite_code
      FROM groups g
      WHERE UPPER(g.invite_code) = ${inviteCode}
        AND g.is_demo = true
        AND EXISTS (
          SELECT 1
          FROM group_members gm
          JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = g.id
            AND u.email IN (
              ${personas.yuito.email},
              ${personas.aoi.email},
              ${personas.haruhi.email},
              ${personas.nami.email}
            )
        )
    `
    if (!group) return c.json({ error: '招待コードが見つからないか、デモでは参加できないグループです。' }, 404)

    const members = await sql`
      SELECT u.id, u.name, u.email, gm.role
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ${group.id}
      ORDER BY gm.role, u.name
    `
    const events = await sql`
      SELECT
        e.*,
        g.name AS group_name,
        creator.name AS creator_name,
        editor.name AS editor_name
      FROM events e
      JOIN groups g ON g.id = e.group_id
      LEFT JOIN users creator ON creator.id = e.created_by
      LEFT JOIN users editor ON editor.id = e.updated_by
      WHERE e.group_id = ${group.id}
      ORDER BY e.start_time ASC
    `

    c.header('Cache-Control', 'no-store')
    const { invite_code: _, ...groupWithoutInviteCode } = group
    return c.json({ group: groupWithoutInviteCode, members, events })
  },

  endSession(c: AppContext) {
    deleteCookie(c, demoCookie, {
      path: '/',
      secure: true,
      sameSite: 'None',
    })
    c.header('Cache-Control', 'no-store')
    return c.json({ message: 'デモを終了しました。' })
  },
}
