import { z } from 'zod'

const productType = z.enum([
  'TANJORE_PAINTING',
  'PENCIL_ART',
  'WATERCOLOR_ART',
  'PAINTING_MATERIALS',
])

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  min_price: z.coerce.number().optional(),
  max_price: z.coerce.number().optional(),
  product_type: productType.optional(),
  in_stock: z.coerce.boolean().optional(),
  sort: z
    .enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest'])
    .optional(),
})

export const createProductSchema = z.object({
  name: z.string().min(2).max(255),
  short_description: z.string().min(2).max(500),
  description: z.string().min(2),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  product_type: productType,
  is_active: z.boolean(),
  image_urls: z.array(z.string()).max(10).default([]),
  video_url: z.string().optional(),
  sku: z.string().max(64).optional(),
  compare_at_price: z.coerce.number().positive().optional(),
  featured: z.boolean().optional(),
  trending: z.boolean().optional(),
  specifications: z
    .array(z.object({ label: z.string(), value: z.string(), sort_order: z.number().optional() }))
    .optional(),
})

export const updateProductSchema = createProductSchema.partial()
