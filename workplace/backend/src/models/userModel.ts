import { sql } from '../config/db'

export interface User {
  id: number
  google_id: string
  name: string
  email: string
  picture?: string
  google_access_token?: string
  google_refresh_token?: string
  google_token_expires_at?: number
}

export const UserModel = {
  async findById(id: string | number): Promise<User | null> {
    const result = await sql`
      SELECT id, google_id, name, email, picture
      FROM users
      WHERE id = ${id}
    `
    if (result.length === 0) return null
    return result[0] as User
  },

  async updateName(id: string | number, name: string): Promise<User | null> {
    const result = await sql`
      UPDATE users
      SET name = ${name}
      WHERE id = ${id}
      RETURNING id, google_id, name, email, picture
    `
    if (result.length === 0) return null
    return result[0] as User
  },

  async updatePicture(id: string | number, picture: string): Promise<User | null> {
    const result = await sql`
      UPDATE users
      SET picture = ${picture}
      WHERE id = ${id}
      RETURNING id, google_id, name, email, picture
    `
    if (result.length === 0) return null
    return result[0] as User
  },

  async findByGoogleId(googleId: string): Promise<User | null> {
    const result = await sql`SELECT * FROM users WHERE google_id = ${googleId}`
    if (result.length === 0) return null
    return result[0] as User
  },

  async findByEmail(email: string): Promise<User | null> {
    const result = await sql`SELECT * FROM users WHERE email = ${email}`
    if (result.length === 0) return null
    return result[0] as User
  },

  async createGoogleUser(
    googleId: string,
    name: string,
    email: string,
    picture: string
  ): Promise<User> {
    const result = await sql`
      INSERT INTO users (google_id, name, email, picture)
      VALUES (${googleId}, ${name}, ${email}, ${picture})
      RETURNING *
    `
    return result[0] as User
  },

  async updateGoogleTokens(
    userId: number,
    tokens: {
      accessToken: string | null
      refreshToken: string | null
      expiryDate: number | null
    }
  ) {
    if (tokens.refreshToken) {
      await sql`
        UPDATE users
        SET google_access_token = ${tokens.accessToken},
            google_refresh_token = ${tokens.refreshToken},
            google_token_expires_at = ${tokens.expiryDate}
        WHERE id = ${userId}
      `
    } else {
      await sql`
        UPDATE users
        SET google_access_token = ${tokens.accessToken},
            google_token_expires_at = ${tokens.expiryDate}
        WHERE id = ${userId}
      `
    }
  },
}