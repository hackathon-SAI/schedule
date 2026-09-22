import { Hono } from 'hono'
import { Env } from '../types/hono'
import { authCheck } from '../middleware/authMiddleware'
import { EventController } from '../controllers/eventController'
import { createEventSchema, updateEventSchema } from '../validators/eventValidators'

const eventRoutes = new Hono<Env>()

eventRoutes.use('*', authCheck)

// GET  /api/events/
eventRoutes.get('/', EventController.getByGroup)

// POST /api/events/
eventRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = createEventSchema.safeParse(body)

  if (!result.success) {
    const errors = result.error.issues.map((issue) => issue.message)
    return c.json({ errors }, 400)
  }

  return EventController.create(c, result.data)
})

// DELETE /api/events/:id
eventRoutes.delete('/:id', authCheck, EventController.delete)

export default eventRoutes