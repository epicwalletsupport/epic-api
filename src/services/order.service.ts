import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems, orders, productMedia, products } from '../db/schema'
import type { Env } from '../types/env'
import {
  toDbOrderStatus,
  toFrontendOrderStatus,
  toFrontendPaymentStatus,
  productTypeFromCategory,
} from '../utils/mappers'
import { toNumber, roundMoney } from '../utils/money'
import { generateOrderNumber } from '../utils/slug'
import { AppError } from '../utils/response'
import { decrementStock, getActiveProductsForCart } from './product.service'
import { resolveMediaUrl } from './r2.service'
import { asc, inArray } from 'drizzle-orm'

type CreateOrderInput = {
  customer_name: string
  customer_email: string
  customer_phone: string
  shipping_address: {
    address: string
    city: string
    state: string
    pincode: string
    country: string
  }
  items: { product_id: string; quantity: number }[]
}

async function primaryImageMap(db: Db, productIds: string[]) {
  if (!productIds.length) return new Map<string, string>()
  const media = await db.query.productMedia.findMany({
    where: and(inArray(productMedia.productId, productIds), eq(productMedia.mediaType, 'IMAGE')),
    orderBy: [asc(productMedia.sortOrder)],
  })
  const map = new Map<string, string>()
  for (const row of media) {
    if (!map.has(row.productId)) map.set(row.productId, row.r2Key)
  }
  return map
}

function mapOrderRow(
  order: typeof orders.$inferSelect,
  items: (typeof orderItems.$inferSelect)[],
  env: Env,
) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    created_at: order.createdAt.toISOString(),
    items: items.map((item) => ({
      product_id: item.productId ?? '',
      product_name: item.productName,
      product_type: item.productType,
      image_url: resolveMediaUrl(env, item.imageUrl),
      quantity: item.quantity,
      unit_price: toNumber(item.unitPrice),
      subtotal: toNumber(item.totalPrice),
    })),
    subtotal: toNumber(order.subtotal),
    total: toNumber(order.total),
    payment_status: toFrontendPaymentStatus(order.paymentStatus),
    order_status: toFrontendOrderStatus(order.orderStatus),
    shipping_address: {
      address: order.shippingLine1,
      city: order.shippingCity,
      state: order.shippingState,
      pincode: order.shippingPostalCode,
      country: order.shippingCountry,
    },
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    customer_phone: order.customerPhone,
  }
}

export async function createOrder(db: Db, env: Env, input: CreateOrderInput, userId?: string) {
  const ids = input.items.map((i) => i.product_id)
  const activeProducts = await getActiveProductsForCart(db, ids)
  const productMap = new Map(activeProducts.map((p) => [p.id, p]))
  const imageKeys = await primaryImageMap(db, ids)

  let subtotal = 0
  const lineItems: {
    product: typeof products.$inferSelect
    quantity: number
    unitPrice: number
    totalPrice: number
    imageKey: string
  }[] = []

  for (const item of input.items) {
    const product = productMap.get(item.product_id)
    if (!product) throw new AppError('Product not found or inactive', 'PRODUCT_NOT_FOUND', 400)
    if (product.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK', 400)
    }
    const unitPrice = toNumber(product.price)
    const totalPrice = roundMoney(unitPrice * item.quantity)
    subtotal += totalPrice
    lineItems.push({
      product,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      imageKey: imageKeys.get(product.id) ?? '/banners/category-watercolor-art.jpg',
    })
  }

  subtotal = roundMoney(subtotal)
  const total = subtotal

  const orderNumber = generateOrderNumber()

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: userId ?? null,
        customerName: input.customer_name,
        customerEmail: input.customer_email.toLowerCase(),
        customerPhone: input.customer_phone,
        shippingFullName: input.customer_name,
        shippingLine1: input.shipping_address.address,
        shippingLine2: null,
        shippingCity: input.shipping_address.city,
        shippingState: input.shipping_address.state,
        shippingPostalCode: input.shipping_address.pincode,
        shippingCountry: input.shipping_address.country,
        subtotal: String(subtotal),
        total: String(total),
        orderStatus: 'payment_pending',
        paymentStatus: 'pending',
      })
      .returning()

    for (const line of lineItems) {
      const ok = await tx
        .update(products)
        .set({
          stock: sql`${products.stock} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, line.product.id), gte(products.stock, line.quantity)))
        .returning({ id: products.id })

      if (ok.length === 0) {
        throw new AppError(`Insufficient stock for ${line.product.name}`, 'INSUFFICIENT_STOCK', 409)
      }

      await tx.insert(orderItems).values({
        orderId: order.id,
        productId: line.product.id,
        productName: line.product.name,
        productSku: line.product.sku,
        productType: productTypeFromCategory(line.product.categoryId),
        imageUrl: line.imageKey,
        quantity: line.quantity,
        unitPrice: String(line.unitPrice),
        totalPrice: String(line.totalPrice),
      })
    }

    return order
  })

  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, result.id) })
  return mapOrderRow(result, items, env)
}

export async function listOrdersForUser(db: Db, env: Env, userId: string) {
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: [desc(orders.createdAt)],
  })
  return Promise.all(
    rows.map(async (order) => {
      const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) })
      return mapOrderRow(order, items, env)
    }),
  )
}

export async function getOrderById(db: Db, env: Env, orderId: string, userId?: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) throw new AppError('Order not found', 'ORDER_NOT_FOUND', 404)
  if (userId && order.userId && order.userId !== userId) {
    throw new AppError('Order not found', 'ORDER_NOT_FOUND', 404)
  }
  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) })
  return mapOrderRow(order, items, env)
}

export async function listAllOrders(db: Db, env: Env) {
  const rows = await db.query.orders.findMany({ orderBy: [desc(orders.createdAt)] })
  return Promise.all(
    rows.map(async (order) => {
      const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) })
      return mapOrderRow(order, items, env)
    }),
  )
}

export async function updateOrderStatus(db: Db, env: Env, orderId: string, frontendStatus: string) {
  const dbStatus = toDbOrderStatus(frontendStatus)
  const [updated] = await db
    .update(orders)
    .set({ orderStatus: dbStatus as typeof orders.$inferInsert.orderStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning()
  if (!updated) throw new AppError('Order not found', 'ORDER_NOT_FOUND', 404)
  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, updated.id) })
  return mapOrderRow(updated, items, env)
}

export async function getSellerDashboardStats(db: Db) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const allOrders = await db.query.orders.findMany()
  const todays = allOrders.filter((o) => o.createdAt >= start)
  const allProducts = await db.query.products.findMany()

  return {
    todays_orders: todays.length,
    todays_order_value: roundMoney(todays.reduce((sum, o) => sum + toNumber(o.total), 0)),
    active_products: allProducts.filter((p) => p.status === 'active').length,
    out_of_stock_products: allProducts.filter((p) => p.stock <= 0).length,
    as_of: new Date().toISOString(),
  }
}

// exported for potential reuse in payment failure rollback flows
export { decrementStock }
