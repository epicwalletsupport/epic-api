import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
  validateCartItems,
} from '../services/cart.service'
import type { AppVariables, Env } from '../types/env'
import { direct, success } from '../utils/response'
import {
  addCartItemSchema,
  cartValidateSchema,
  updateCartItemSchema,
} from '../validators/cart.schema'

export const cartRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

cartRoutes.post('/validate', zValidator('json', cartValidateSchema), async (c) => {
  const db = createDb(c.env)
  const data = await validateCartItems(db, c.req.valid('json').items)
  return direct(c, data)
})

cartRoutes.use('*', authMiddleware)

cartRoutes.get('/', async (c) => {
  const db = createDb(c.env)
  const userId = c.get('userId')!
  const data = await getCart(db, c.env, userId)
  return success(c, 'Cart fetched', data)
})

cartRoutes.post('/items', zValidator('json', addCartItemSchema), async (c) => {
  const db = createDb(c.env)
  const body = c.req.valid('json')
  await addCartItem(db, c.get('userId')!, body.product_id, body.quantity)
  const data = await getCart(db, c.env, c.get('userId')!)
  return success(c, 'Item added to cart', data, 201)
})

cartRoutes.patch('/items/:productId', zValidator('json', updateCartItemSchema), async (c) => {
  const db = createDb(c.env)
  const quantity = c.req.valid('json').quantity
  await updateCartItem(db, c.get('userId')!, c.req.param('productId'), quantity)
  const data = await getCart(db, c.env, c.get('userId')!)
  return success(c, 'Cart item updated', data)
})

cartRoutes.delete('/items/:productId', async (c) => {
  const db = createDb(c.env)
  await removeCartItem(db, c.get('userId')!, c.req.param('productId'))
  const data = await getCart(db, c.env, c.get('userId')!)
  return success(c, 'Cart item removed', data)
})

cartRoutes.delete('/', async (c) => {
  const db = createDb(c.env)
  await clearCart(db, c.get('userId')!)
  return success(c, 'Cart cleared', null)
})
