import { AppContext } from '../types/hono'
import { sql } from '../config/db'
import { CreateEventInput, UpdateEventInput } from '../validators/eventValidators'

export const EventController = {
  // 1. 予定の作成 (POST /api/events)
  async create(c: AppContext, data: CreateEventInput) {
    try {
      const user = c.get('jwtPayload')
      const { group_id, title, description, start_time, end_time, subject, subject_color } = data
      const [membership] = await sql`
        SELECT role FROM group_members WHERE user_id = ${user.id} AND group_id = ${group_id}
      `
      if (!membership) {
        return c.json({ error: 'このグループに予定を作成する権限がありません' }, 403)
      }

      const [newEvent] = await sql`
        INSERT INTO events (group_id, created_by, title, description, start_time, end_time, subject, subject_color)
        VALUES (${group_id}, ${user.id}, ${title}, ${description || null}, ${start_time}, ${end_time}, ${subject || null}, ${subject_color || null})
        RETURNING *
      `

      return c.json({ message: '予定を作成しました', event: newEvent }, 201)
    } catch (err) {
      console.error(err)
      return c.json({ error: '予定の作成に失敗しました' }, 500)
    }
  },

  // 2. 自分が所属する特定グループの予定一覧取得 (GET /api/events?groupId=xx)
  async getByGroup(c: AppContext) {
    try {
      const user = c.get('jwtPayload')
      const groupId = c.req.query('groupId')

      if (!groupId) {
        return c.json({ error: 'groupId が指定されていません' }, 400)
      }

      const [membership] = await sql`
        SELECT role FROM group_members WHERE user_id = ${user.id} AND group_id = ${groupId}
      `
      if (!membership) {
        return c.json({ error: 'このグループの予定を閲覧する権限がありません' }, 403)
      }

      const events = await sql`
        SELECT e.*, u.name as creator_name
        FROM events e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.group_id = ${groupId}
        ORDER BY e.start_time ASC
      `

      return c.json({ events }, 200)
    } catch (err) {
      console.error(err)
      return c.json({ error: '予定の取得に失敗しました' }, 500)
    }
  },

  // 3. 予定の更新 (PUT /api/events/:id)
  async update(c: AppContext, data: UpdateEventInput) {
    try {
      const user = c.get('jwtPayload')
      const eventId = c.req.param('id')
      const [existingEvent] = await sql`
        SELECT e.*, gm.role
        FROM events e
        INNER JOIN group_members gm ON e.group_id = gm.group_id AND gm.user_id = ${user.id}
        WHERE e.id = ${eventId}
      `

      if (!existingEvent) {
        return c.json({ error: '該当する予定が見つからないか、更新権限がありません' }, 404)
      }

      const title = data.title ?? existingEvent.title
      const description = data.description ?? existingEvent.description
      const start_time = data.start_time ?? existingEvent.start_time
      const end_time = data.end_time ?? existingEvent.end_time
      const subject = data.subject ?? existingEvent.subject
      const subject_color = data.subject_color ?? existingEvent.subject_color

      const [updatedEvent] = await sql`
        UPDATE events
        SET title = ${title},
            description = ${description},
            start_time = ${start_time},
            end_time = ${end_time},
            subject = ${subject},
            subject_color = ${subject_color}
        WHERE id = ${eventId}
        RETURNING *
      `

      return c.json({ message: '予定を更新しました', event: updatedEvent }, 200)
    } catch (err) {
      console.error(err)
      return c.json({ error: '予定の更新に失敗しました' }, 500)
    }
  },

  // 4. 予定の削除 (DELETE /api/events/:id)
  async delete(c: AppContext) {
    try {
      const user = c.get('jwtPayload')
      const eventId = c.req.param('id')
      const [target] = await sql`
        SELECT e.id, e.created_by, gm.role
        FROM events e
        INNER JOIN group_members gm ON e.group_id = gm.group_id AND gm.user_id = ${user.id}
        WHERE e.id = ${eventId}
      `

      if (!target) {
        return c.json({ error: '予定が見つかりません' }, 404)
      }

      if (target.created_by !== user.id && target.role !== 'admin') {
        return c.json({ error: 'この予定を削除する権限がありません' }, 403)
      }

      await sql`DELETE FROM events WHERE id = ${eventId}`

      return c.json({ message: '予定を削除しました' }, 200)
    } catch (err) {
      console.error(err)
      return c.json({ error: '予定の削除に失敗しました' }, 500)
    }
  }
}