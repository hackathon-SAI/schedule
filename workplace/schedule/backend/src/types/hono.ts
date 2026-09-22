import { Context as HonoContext } from 'hono'

export type Env = {
  Variables: {
    jwtPayload: {
      id: number
      email: string
      name?: string
      exp?: number
    }
  }
}

export type AppContext = HonoContext<Env>