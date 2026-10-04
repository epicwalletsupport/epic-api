import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import { authMiddleware, requireRoles } from '../middleware/auth.middleware'
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductBySlug,
  listProducts,
  updateProduct,
} from '../services/product.service'
import type { AppVariables, Env } from '../types/env'
import { direct, success } from '../utils/response'
import { createProductSchema, productQuerySchema, updateProductSchema } from '../validators/product.schema'

export const productRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

productRoutes.get('/', zValidator('query', productQuerySchema), async (c) => {
  const db = createDb(c.env)
  const query = c.req.valid('query')
  const data = await listProducts(db, c.env, query)
  return direct(c, data)
})

productRoutes.get('/slug/:slug', async (c) => {
  const db = createDb(c.env)
  const data = await getProductBySlug(db, c.env, c.req.param('slug'))
  return success(c, 'Product fetched successfully', data)
})

productRoutes.get('/:id', async (c) => {
  const db = createDb(c.env)
  const data = await getProductById(db, c.env, c.req.param('id'))
  return direct(c, data)
})

productRoutes.post(
  '/',
  authMiddleware,
  requireRoles('seller', 'admin'),
  zValidator('json', createProductSchema),
  async (c) => {
    const db = createDb(c.env)
    const data = await createProduct(db, c.env, c.req.valid('json'), c.get('userId'))
    return success(c, 'Product created', data, 201)
  },
)

productRoutes.patch(
  '/:id',
  authMiddleware,
  requireRoles('seller', 'admin'),
  zValidator('json', updateProductSchema),
  async (c) => {
    const db = createDb(c.env)
    const data = await updateProduct(db, c.env, c.req.param('id')!, c.req.valid('json'))
    return success(c, 'Product updated', data)
  },
)

productRoutes.delete('/:id', authMiddleware, requireRoles('seller', 'admin'), async (c) => {
  const db = createDb(c.env)
  await deleteProduct(db, c.env, c.req.param('id')!)
  return success(c, 'Product deleted', null)
})
