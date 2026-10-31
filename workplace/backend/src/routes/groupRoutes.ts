
import { Hono } from 'hono'
import { Env } from '../types/hono'
import { authCheck } from '../middleware/authMiddleware'
import { GroupController } from '../controllers/groupController'

const groupRoutes = new Hono<Env>()

groupRoutes.use('*', authCheck)

groupRoutes.get('/', (c) => GroupController.list(c))
groupRoutes.post('/', (c) => GroupController.create(c))
groupRoutes.post('/join', (c) => GroupController.join(c))
groupRoutes.delete('/:id/leave', (c) => GroupController.leave(c))
groupRoutes.get('/:id', (c) => GroupController.detail(c))
groupRoutes.get('/:id/events', (c) => GroupController.listEvents(c))
groupRoutes.post('/:id/events', (c) => GroupController.createEvent(c))

export default groupRoutes
