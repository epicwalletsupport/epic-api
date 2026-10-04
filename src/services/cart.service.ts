import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { cartItems, carts } from '../db/schema'
import { toNumber } from '../utils/money'
import { AppError } from '../utils/response'
import { getActiveProductsForCart } from './product.service'
import { resolveMediaUrl } from './r2.service'
import type { Env } from '../types/env'
import { productMedia } from '../db/schema'
import { asc, inArray } from 'drizzle-orm'

async function getOrCreateCart(db: Db, userId: string) {
  const existing = await db.query.carts.findFirst({ where: eq(carts.userId, userId) })
  if (existing) return existing
  const [created] = await db.insert(carts).values({ userId }).returning()
  return created
}

export async function getCart(db: Db, env: Env, userId: string) {
  const cart = await getOrCreateCart(db, userId)
  const items = await db.query.cartItems.findMany({ where: eq(cartItems.cartId, cart.id) })
  const productIds = items.map((i) => i.productId)
  const products = await getActiveProductsForCart(db, productIds)
  const productMap = new Map(products.map((p) => [p.id, p]))
  const media = productIds.length
    ? await db.query.productMedia.findMany({
        where: and(inArray(productMedia.productId, productIds), eq(productMedia.mediaType, 'IMAGE')),
        orderBy: [asc(productMedia.sortOrder)],
      })
    : []
  const imageMap = new Map<string, string>()
  for (const row of media) {
    if (!imageMap.has(row.productId)) imageMap.set(row.productId, resolveMediaUrl(env, row.r2Key))
  }

  const mappedItems = items
    .map((item) => {
      const product = productMap.get(item.productId)
      if (!product) return null
      return {
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: toNumber(product.price),
        subtotal: toNumber(product.price) * item.quantity,
        product: {
          id: product.id,
          name: product.name,
          price: toNumber(product.price),
          stock: product.stock,
          image_url: imageMap.get(product.id),
        },
      }
    })
    .filter(Boolean)

  const total = mappedItems.reduce((sum, item) => sum + (item?.subtotal ?? 0), 0)
  return { id: cart.id, items: mappedItems, total }
}

export async function addCartItem(db: Db, userId: string, productId: string, quantity: number) {
  const [product] = await getActiveProductsForCart(db, [productId])
  if (!product) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  if (product.stock < quantity) throw new AppError('Insufficient stock', 'INSUFFICIENT_STOCK', 400)

  const cart = await getOrCreateCart(db, userId)
  const existing = await db.query.cartItems.findFirst({
    where: and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId)),
  })

  if (existing) {
    const nextQty = existing.quantity + quantity
    if (nextQty > product.stock) throw new AppError('Insufficient stock', 'INSUFFICIENT_STOCK', 400)
    await db
      .update(cartItems)
      .set({ quantity: nextQty, updatedAt: new Date() })
      .where(eq(cartItems.id, existing.id))
  } else {
    await db.insert(cartItems).values({ cartId: cart.id, productId, quantity })
  }

  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id))
}

export async function updateCartItem(db: Db, userId: string, productId: string, quantity: number) {
  const [product] = await getActiveProductsForCart(db, [productId])
  if (!product) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  if (product.stock < quantity) throw new AppError('Insufficient stock', 'INSUFFICIENT_STOCK', 400)

  const cart = await getOrCreateCart(db, userId)
  await db
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId)))

  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id))
}

export async function removeCartItem(db: Db, userId: string, productId: string) {
  const cart = await getOrCreateCart(db, userId)
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId)))
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id))
}

export async function clearCart(db: Db, userId: string) {
  const cart = await getOrCreateCart(db, userId)
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id))
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id))
}

export async function validateCartItems(
  db: Db,
  items: { product_id: string; quantity: number }[],
) {
  const ids = items.map((i) => i.product_id)
  const products = await getActiveProductsForCart(db, ids)
  const productMap = new Map(products.map((p) => [p.id, p]))

  const validated = items.map((item) => {
    const product = productMap.get(item.product_id)
    const unit_price = product ? toNumber(product.price) : 0
    const in_stock = Boolean(product && product.stock >= item.quantity)
    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price,
      subtotal: unit_price * item.quantity,
      in_stock,
    }
  })

  const valid = validated.every((item) => item.in_stock && item.unit_price > 0)
  const total = validated.reduce((sum, item) => sum + item.subtotal, 0)
  return { valid, total, items: validated }
}
