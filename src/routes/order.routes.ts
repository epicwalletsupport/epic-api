import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware'
import { createOrder, getOrderById, listOrdersForUser } from '../services/order.service'
import { buildPaymentInitResponse, createRazorpayOrder } from '../services/payment.service'
import type { AppVariables, Env } from '../types/env'
import { direct } from '../utils/response'
import { createOrderSchema } from '../validators/order.schema'

export const orderRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

orderRoutes.post('/', optionalAuthMiddleware, zValidator('json', createOrderSchema), async (c) => {
  const db = createDb(c.env)
  const body = c.req.valid('json')
  const userId = c.get('userId')
  const order = await createOrder(db, c.env, body, userId)

  let payment
  try {
    const created = await createRazorpayOrder(db, c.env, order.id)
    payment = buildPaymentInitResponse(created)
  } catch {
    payment = {
      payment_id: order.id,
      amount: order.total,
      currency: 'INR',
    }
  }

  return direct(c, { order, payment })
})

orderRoutes.get('/', authMiddleware, async (c) => {
  const db = createDb(c.env)
  const data = await listOrdersForUser(db, c.env, c.get('userId')!)
  return direct(c, data)
})

orderRoutes.get('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env)
  const data = await getOrderById(db, c.env, c.req.param('id')!, c.get('userId')!)
  return direct(c, data)
})
