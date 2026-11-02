
import { Hono } from 'hono'
import { Env } from '../types/hono'
import { authCheck, rejectDemoAccess } from '../middleware/authMiddleware'
import { GroupController } from '../controllers/groupController'
import { GroupChatController } from '../controllers/groupChatController'

const groupRoutes = new Hono<Env>()

groupRoutes.use('*', authCheck)

groupRoutes.get('/', (c) => GroupController.list(c))
groupRoutes.post('/', rejectDemoAccess, (c) => GroupController.create(c))
groupRoutes.put('/:id', rejectDemoAccess, (c) => GroupController.update(c))
groupRoutes.post('/join', rejectDemoAccess, (c) => GroupController.join(c))
groupRoutes.get('/:id/messages', (c) => GroupChatController.list(c))
groupRoutes.post('/:id/messages', rejectDemoAccess, (c) => GroupChatController.create(c))
groupRoutes.delete('/:id/leave', rejectDemoAccess, (c) => GroupController.leave(c))
groupRoutes.get('/:id', (c) => GroupController.detail(c))
groupRoutes.get('/:id/events', (c) => GroupController.listEvents(c))
groupRoutes.post('/:id/events', rejectDemoAccess, (c) => GroupController.createEvent(c))

export default groupRoutes