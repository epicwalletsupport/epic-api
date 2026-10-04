import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import { authMiddleware, requireRoles } from '../middleware/auth.middleware'
import { getSellerDashboardStats, listAllOrders, updateOrderStatus } from '../services/order.service'
import {
  createProduct,
  deleteProduct,
  getSellerProduct,
  listSellerProducts,
  updateProduct,
} from '../services/product.service'
import type { AppVariables, Env } from '../types/env'
import { direct } from '../utils/response'
import { updateOrderStatusSchema } from '../validators/order.schema'
import { createProductSchema as sellerProductSchema } from '../validators/product.schema'

export const sellerRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

sellerRoutes.use('*', authMiddleware, requireRoles('seller', 'admin'))

sellerRoutes.get('/dashboard/stats', async (c) => {
  const db = createDb(c.env)
  return direct(c, await getSellerDashboardStats(db))
})

sellerRoutes.get('/orders', async (c) => {
  const db = createDb(c.env)
  return direct(c, await listAllOrders(db, c.env))
})

sellerRoutes.patch('/orders/:id', zValidator('json', updateOrderStatusSchema), async (c) => {
  const db = createDb(c.env)
  const data = await updateOrderStatus(
    db,
    c.env,
    c.req.param('id'),
    c.req.valid('json').order_status,
  )
  return direct(c, data)
})

sellerRoutes.get('/products', async (c) => {
  const db = createDb(c.env)
  return direct(c, await listSellerProducts(db, c.env))
})

sellerRoutes.get('/products/:id', async (c) => {
  const db = createDb(c.env)
  return direct(c, await getSellerProduct(db, c.env, c.req.param('id')))
})

sellerRoutes.post('/products', zValidator('json', sellerProductSchema), async (c) => {
  const db = createDb(c.env)
  return direct(c, await createProduct(db, c.env, c.req.valid('json'), c.get('userId')), 201)
})

sellerRoutes.put('/products/:id', zValidator('json', sellerProductSchema), async (c) => {
  const db = createDb(c.env)
  return direct(c, await updateProduct(db, c.env, c.req.param('id'), c.req.valid('json')))
})

sellerRoutes.delete('/products/:id', async (c) => {
  const db = createDb(c.env)
  await deleteProduct(db, c.env, c.req.param('id'))
  return direct(c, { success: true })
})
