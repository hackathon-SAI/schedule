import { sql } from '../config/db'

export interface Group {
  id?: number
  group_name: string
  color?: string
  invite_code?: string
}

export const groupModel = {
  // グループ新規作成（カラー指定対応）
  async createGroup(groupName: string, inviteCode: string, color: string = '#3b82f6') {
    const [group] = await sql`
      INSERT INTO groups (group_name, invite_code, color)
      VALUES (${groupName}, ${inviteCode}, ${color})
      RETURNING *
    `
    return group
  },

  // IDからグループ検索
  async findById(groupId: number) {
    const [group] = await sql`
      SELECT * FROM groups WHERE id = ${groupId}
    `
    return group
  },

  // 招待コードからグループ検索
  async findByInviteCode(inviteCode: string) {
    const [group] = await sql`
      SELECT * FROM groups WHERE invite_code = ${inviteCode}
    `
    return group
  },

  // メンバー追加
  async addMember(groupId: number, userId: number, role: string = 'member') {
    const [member] = await sql`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (${groupId}, ${userId}, ${role})
      ON CONFLICT (user_id, group_id) DO NOTHING
      RETURNING *
    `
    return member
  },

  // メンバーのロール取得
  async getMemberRole(groupId: number, userId: number) {
    const [member] = await sql`
      SELECT role FROM group_members
      WHERE group_id = ${groupId} AND user_id = ${userId}
    `
    return member ? member.role : null
  },

  // グループ情報の更新（管理者用）
  async updateGroup(groupId: number, groupName?: string, color?: string) {
    const [group] = await sql`
      UPDATE groups
      SET 
        group_name = COALESCE(${groupName ?? null}, group_name),
        color = COALESCE(${color ?? null}, color)
      WHERE id = ${groupId}
      RETURNING *
    `
    return group
  },

  // 所属グループ一覧取得
  async getUserGroups(userId: number) {
    return await sql`
      SELECT g.*, gm.role 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ${userId}
      ORDER BY g.id DESC
    `
  },

  // グループ内共有イベント一覧取得
  async getGroupEvents(groupId: number) {
    return await sql`
      SELECT 
        e.*, 
        u.name AS user_name,
        u.picture AS user_picture
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.group_id = ${groupId}
      ORDER BY e.start_time ASC
    `
  }
}