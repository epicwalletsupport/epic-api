import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import { authMiddleware, requireRoles } from '../middleware/auth.middleware'
import { listAllOrders, updateOrderStatus } from '../services/order.service'
import type { AppVariables, Env } from '../types/env'
import { success } from '../utils/response'
import { updateOrderStatusSchema } from '../validators/order.schema'

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

adminRoutes.use('*', authMiddleware, requireRoles('seller', 'admin'))

adminRoutes.get('/orders', async (c) => {
  const db = createDb(c.env)
  const data = await listAllOrders(db, c.env)
  return success(c, 'Orders fetched', data)
})

adminRoutes.patch('/orders/:id/status', zValidator('json', updateOrderStatusSchema), async (c) => {
  const db = createDb(c.env)
  const data = await updateOrderStatus(
    db,
    c.env,
    c.req.param('id'),
    c.req.valid('json').order_status,
  )
  return success(c, 'Order status updated', data)
})
