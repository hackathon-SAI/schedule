import { Context } from 'hono'
import { sql } from '../config/db'
import { Env } from '../types/hono'
import { randomBytes } from 'node:crypto'

function getUserId(c: Context<Env>) {
  return c.get('jwtPayload').id
}

function makeInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

export const GroupController = {
  // グループ一覧（color を追加取得）
  async list(c: Context<Env>) {
    const userId = getUserId(c)
    if (c.get('jwtPayload').mode === 'demo') {
      const groups = await sql`
        SELECT g.id, g.group_name, g.color, gm.role
        FROM groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ${userId}
        ORDER BY g.id DESC
      `
      return c.json({ groups })
    }

    const groups = await sql`
      SELECT g.id, g.group_name, g.color, g.invite_code, gm.role
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ${userId}
      ORDER BY g.id DESC
    `

    return c.json({ groups })
  },

  // グループ作成（color に対応）
  async create(c: Context<Env>) {
    const userId = getUserId(c)
    const body = await c.req.json().catch(() => ({}))
    const name = typeof body.groupName === 'string' ? body.groupName.trim() : (typeof body.name === 'string' ? body.name.trim() : '')
    const color = typeof body.color === 'string' ? body.color.trim() : '#3b82f6'

    if (!name || name.length > 50) {
      return c.json(
        { error: 'グループ名は1〜50文字で入力してください' },
        400
      )
    }

    const inviteCode = makeInviteCode()

    const created = await sql`
      INSERT INTO groups (group_name, invite_code, color)
      VALUES (${name}, ${inviteCode}, ${color})
      RETURNING id, group_name, color, invite_code
    `

    const group = created[0]

    await sql`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (${group.id}, ${userId}, 'admin')
      ON CONFLICT (group_id, user_id) DO NOTHING
    `

    return c.json({ group }, 201)
  },

  // グループ詳細とメンバー一覧
  async detail(c: Context<Env>) {
    const userId = getUserId(c)
    const groupId = Number(c.req.param('id'))

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return c.json({ error: 'グループIDが不正です' }, 400)
    }

    const access = await sql`
      SELECT role FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `

    if (access.length === 0) {
      return c.json({ error: 'このグループに参加していません' }, 403)
    }

    const result = await sql`
      SELECT id, group_name, color, invite_code
      FROM groups
      WHERE id = ${groupId}
    `

    if (result.length === 0) {
      return c.json({ error: 'グループが見つかりません' }, 404)
    }

    const members = await sql`
      SELECT u.id, u.name, u.email, u.picture, gm.role
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ${groupId}
      ORDER BY gm.role, u.name
    `

    return c.json({
      group: { ...result[0], role: access[0].role },
      members
    })
  },

  // グループ情報の編集（管理者/admin・owner 専用）
  async update(c: Context<Env>) {
    const userId = getUserId(c)
    const groupId = Number(c.req.param('id'))

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return c.json({ error: 'グループIDが不正です' }, 400)
    }

    // 1. ユーザーの権限を検証
    const access = await sql`
      SELECT role FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `

    if (access.length === 0) {
      return c.json({ error: 'このグループに参加していません' }, 403)
    }

    const role = access[0].role
    if (role !== 'admin' && role !== 'owner') {
      return c.json({ error: 'グループ情報の編集権限がありません（管理者のみ変更可能）' }, 403)
    }

    // 2. 更新データの抽出
    const body = await c.req.json().catch(() => ({}))
    const groupName = typeof body.groupName === 'string' ? body.groupName.trim() : null
    const color = typeof body.color === 'string' ? body.color.trim() : null

    if (groupName !== null && (groupName.length === 0 || groupName.length > 50)) {
      return c.json({ error: 'グループ名は1〜50文字で入力してください' }, 400)
    }

    // 3. 更新処理の実行
    const updated = await sql`
      UPDATE groups
      SET 
        group_name = COALESCE(${groupName}, group_name),
        color = COALESCE(${color}, color)
      WHERE id = ${groupId}
      RETURNING id, group_name, color, invite_code
    `

    if (updated.length === 0) {
      return c.json({ error: '対象のグループが見つかりません' }, 404)
    }

    return c.json({ message: 'グループ情報を更新しました', group: updated[0] })
  },

  // 招待コードで参加
  async join(c: Context<Env>) {
    const userId = getUserId(c)
    const body = await c.req.json().catch(() => ({}))
    const inviteCode =
      typeof body.inviteCode === 'string'
        ? body.inviteCode.trim().toUpperCase()
        : ''

    if (!inviteCode) {
      return c.json({ error: '招待コードを入力してください' }, 400)
    }

    const found = await sql`
      SELECT id, group_name, color, invite_code FROM groups
      WHERE invite_code = ${inviteCode}
    `

    if (found.length === 0) {
      return c.json({ error: '招待コードが見つかりません' }, 404)
    }

    const group = found[0]
    const membership = await sql`
      SELECT 1 FROM group_members
      WHERE group_id = ${group.id} AND user_id = ${userId}
    `

    if (membership.length > 0) {
      return c.json(
        { error: `「${group.group_name}」にはすでに参加しています` },
        409
      )
    }

    const joined = await sql`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (${group.id}, ${userId}, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING
      RETURNING group_id
    `

    if (joined.length === 0) {
      return c.json(
        { error: `「${group.group_name}」にはすでに参加しています` },
        409
      )
    }

    return c.json({ message: 'グループに参加しました', group })
  },

  // グループから脱退
  async leave(c: Context<Env>) {
    const userId = getUserId(c)
    const groupId = Number(c.req.param('id'))

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return c.json({ error: 'グループIDが不正です' }, 400)
    }

    const membership = await sql`
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `

    if (membership.length === 0) {
      return c.json({ error: 'このグループに参加していません' }, 404)
    }

    await sql.transaction([
      sql`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`,
      sql`
        UPDATE group_members
        SET role = 'admin'
        WHERE group_id = ${groupId}
          AND user_id = (
            SELECT candidate.user_id
            FROM group_members candidate
            WHERE candidate.group_id = ${groupId}
              AND candidate.user_id <> ${userId}
            ORDER BY CASE WHEN candidate.role = 'admin' THEN 0 ELSE 1 END,
              candidate.user_id
            LIMIT 1
          )
          AND EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = ${groupId}
              AND user_id = ${userId}
              AND role = 'admin'
          )
          AND NOT EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = ${groupId}
              AND user_id <> ${userId}
              AND role = 'admin'
          )
      `,
      sql`
        DELETE FROM group_members
        WHERE group_id = ${groupId} AND user_id = ${userId}
      `,
      sql`
        DELETE FROM events
        WHERE group_id = ${groupId}
          AND NOT EXISTS (
            SELECT 1 FROM group_members WHERE group_id = ${groupId}
          )
      `,
      sql`
        DELETE FROM groups
        WHERE id = ${groupId}
          AND NOT EXISTS (
            SELECT 1 FROM group_members WHERE group_id = ${groupId}
          )
      `,
    ])

    const remainingGroup = await sql`
      SELECT id FROM groups WHERE id = ${groupId}
    `
    const groupDeleted = remainingGroup.length === 0

    return c.json({
      message: groupDeleted
        ? '最後のメンバーとしてグループから脱退し、グループを削除しました'
        : 'グループから脱退しました',
      groupDeleted,
    })
  },

  // グループの共有イベント一覧
  async listEvents(c: Context<Env>) {
    const userId = getUserId(c)
    const groupId = Number(c.req.param('id'))

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return c.json({ error: 'グループIDが不正です' }, 400)
    }

    const access = await sql`
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `

    if (access.length === 0) {
      return c.json({ error: 'このグループに参加していません' }, 403)
    }

    const events = await sql`
      SELECT e.*, creator.name AS creator_name, editor.name AS editor_name
      FROM events e
      LEFT JOIN users creator ON e.created_by = creator.id
      LEFT JOIN users editor ON e.updated_by = editor.id
      WHERE e.group_id = ${groupId}
      ORDER BY e.start_time ASC
    `

    return c.json({ events })
  },

  // グループの共有イベント作成
  async createEvent(c: Context<Env>) {
    const userId = getUserId(c)
    const groupId = Number(c.req.param('id'))
    const body = await c.req.json().catch(() => ({}))

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return c.json({ error: 'グループIDが不正です' }, 400)
    }

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const startTime = body.start_time
    const endTime = body.end_time

    if (
      !title ||
      typeof startTime !== 'string' ||
      typeof endTime !== 'string' ||
      !Number.isFinite(Date.parse(startTime)) ||
      !Number.isFinite(Date.parse(endTime)) ||
      Date.parse(endTime) <= Date.parse(startTime)
    ) {
      return c.json(
        { error: 'タイトルと正しい開始・終了時刻を入力してください' },
        400
      )
    }

    const access = await sql`
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `

    if (access.length === 0) {
      return c.json({ error: 'このグループに参加していません' }, 403)
    }

    const created = await sql`
      INSERT INTO events (
        group_id, created_by, updated_by, title, description,
        start_time, end_time, subject, subject_color
      )
      VALUES (
        ${groupId},
        ${userId},
        ${userId},
        ${title},
        ${typeof body.description === 'string' ? body.description : null},
        ${startTime},
        ${endTime},
        ${typeof body.subject === 'string' ? body.subject : null},
        ${typeof body.subject_color === 'string' ? body.subject_color : null}
      )
      RETURNING *
    `

    return c.json({ event: created[0] }, 201)
  }
}