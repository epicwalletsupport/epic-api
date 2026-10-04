import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { products } from './products'
import { users } from './users'

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'payment_pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'failed',
  'refunded',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'success',
  'failed',
  'refunded',
])

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 32 }).notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  shippingFullName: varchar('shipping_full_name', { length: 120 }).notNull(),
  shippingLine1: text('shipping_line1').notNull(),
  shippingLine2: text('shipping_line2'),
  shippingCity: varchar('shipping_city', { length: 120 }).notNull(),
  shippingState: varchar('shipping_state', { length: 120 }).notNull(),
  shippingPostalCode: varchar('shipping_postal_code', { length: 20 }).notNull(),
  shippingCountry: varchar('shipping_country', { length: 120 }).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  orderStatus: orderStatusEnum('order_status').notNull().default('payment_pending'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  productName: varchar('product_name', { length: 255 }).notNull(),
  productSku: varchar('product_sku', { length: 64 }),
  productType: varchar('product_type', { length: 64 }).notNull(),
  imageUrl: text('image_url').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
})

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  razorpayOrderId: varchar('razorpay_order_id', { length: 64 }),
  razorpayPaymentId: varchar('razorpay_payment_id', { length: 64 }),
  razorpaySignature: text('razorpay_signature'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('INR'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: varchar('event_id', { length: 128 }).notNull().unique(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  payload: text('payload').notNull(),
  processed: integer('processed').notNull().default(0),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
