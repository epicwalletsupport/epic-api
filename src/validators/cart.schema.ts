import { z } from 'zod'

export const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
})

export const cartValidateSchema = z.object({
  items: z.array(cartItemSchema).min(1),
})

export const addCartItemSchema = cartItemSchema
export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().positive(),
})
