import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import {
  buildPaymentInitResponse,
  createRazorpayOrder,
  processWebhook,
  verifyRazorpayPaymentWithSecret,
} from '../services/payment.service'
import type { AppVariables, Env } from '../types/env'
import { direct, success } from '../utils/response'
import {
  paymentInitiateSchema,
  paymentVerifySchema,
  razorpayCreateOrderSchema,
} from '../validators/order.schema'

export const paymentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

paymentRoutes.post('/initiate', zValidator('json', paymentInitiateSchema), async (c) => {
  const db = createDb(c.env)
  const created = await createRazorpayOrder(db, c.env, c.req.valid('json').order_id)
  return direct(c, buildPaymentInitResponse(created))
})

paymentRoutes.post('/create-order', zValidator('json', razorpayCreateOrderSchema), async (c) => {
  const db = createDb(c.env)
  const created = await createRazorpayOrder(db, c.env, c.req.valid('json').order_id)
  return success(c, 'Razorpay order created', buildPaymentInitResponse(created), 201)
})

paymentRoutes.post('/verify', zValidator('json', paymentVerifySchema), async (c) => {
  const db = createDb(c.env)
  const data = await verifyRazorpayPaymentWithSecret(db, c.env, c.req.valid('json'))
  return success(c, 'Payment verified', data)
})

paymentRoutes.post('/webhook', async (c) => {
  const rawBody = await c.req.text()
  const signature = c.req.header('X-Razorpay-Signature')
  const db = createDb(c.env)
  const data = await processWebhook(db, c.env, rawBody, signature)
  return success(c, 'Webhook processed', data)
})
