import { sql } from '../config/db'

export interface Group {
id?: number
name: string
invite_code: string
created_at?: Date
}

export const groupModel = {
  // グループの新規作成
async createGroup(name: string, inviteCode: string) {
    const [group] = await sql`
    INSERT INTO groups (name, invite_code)
    VALUES (${name}, ${inviteCode})
      RETURNING *
    `
    return group
},

  // 招待コードからグループを取得
async findByInviteCode(inviteCode: string) {
    const [group] = await sql`
      SELECT * FROM groups WHERE invite_code = ${inviteCode}
    `
    return group
},

  // メンバーをグループに追加
async addMember(groupId: number, userId: number, role: string = 'member') {
    const [member] = await sql`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (${groupId}, ${userId}, ${role})
    ON CONFLICT (group_id, user_id) DO NOTHING
      RETURNING *
    `
    return member
},

  // ユーザーが所属しているグループ一覧を取得
async getUserGroups(userId: number) {
    return await sql`
    SELECT g.*, gm.role
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ${userId}
    ORDER BY g.created_at DESC
    `
},

  // グループ内の共有イベント（予定・課題）一覧を取得
async getGroupEvents(groupId: number) {
    return await sql`
    SELECT e.*, u.name as user_name
    FROM events e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.group_id = ${groupId}
    ORDER BY e.start_date ASC
    `
}
}