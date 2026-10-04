import { z } from 'zod'

const shippingAddressSchema = z.object({
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  country: z.string().min(2),
})

export const createOrderSchema = z.object({
  customer_name: z.string().min(2),
  customer_email: z.string().email(),
  customer_phone: z.string().regex(/^[6-9]\d{9}$/),
  shipping_address: shippingAddressSchema,
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
    }),
  ).min(1),
})

export const updateOrderStatusSchema = z.object({
  order_status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
})

export const paymentInitiateSchema = z.object({
  order_id: z.string().uuid(),
})

export const paymentVerifySchema = z.object({
  order_id: z.string().uuid(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
})

export const razorpayCreateOrderSchema = z.object({
  order_id: z.string().uuid(),
})
