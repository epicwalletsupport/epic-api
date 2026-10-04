import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import type { Db } from '../db/client'
import { productMedia, productSpecifications, products } from '../db/schema'
import type { Env } from '../types/env'
import { productTypeFromCategory } from '../utils/mappers'
import { toNumber } from '../utils/money'
import { slugify } from '../utils/slug'
import { AppError } from '../utils/response'
import { deleteR2Object, persistMediaInput, resolveMediaUrl } from './r2.service'

type ProductInput = {
  name: string
  short_description: string
  description: string
  price: number
  stock: number
  product_type: string
  is_active: boolean
  image_urls: string[]
  video_url?: string
  sku?: string
  compare_at_price?: number
  featured?: boolean
  trending?: boolean
  specifications?: { label: string; value: string; sort_order?: number }[]
}

async function uniqueSlug(db: Db, name: string, excludeId?: string) {
  const base = slugify(name) || 'product'
  let candidate = base
  let counter = 1
  while (true) {
    const existing = await db.query.products.findFirst({ where: eq(products.slug, candidate) })
    if (!existing || existing.id === excludeId) return candidate
    counter += 1
    candidate = `${base}-${counter}`
  }
}

async function loadMediaMap(db: Db, env: Env, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, (typeof productMedia.$inferSelect)[]>()
  const media = await db.query.productMedia.findMany({
    where: inArray(productMedia.productId, productIds),
    orderBy: [asc(productMedia.sortOrder), asc(productMedia.createdAt)],
  })
  const map = new Map<string, (typeof productMedia.$inferSelect)[]>()
  for (const item of media) {
    const list = map.get(item.productId) ?? []
    list.push(item)
    map.set(item.productId, list)
  }
  return map
}

function mapBuyerProduct(
  product: typeof products.$inferSelect,
  media: (typeof productMedia.$inferSelect)[],
  env: Env,
) {
  const image = media.find((m) => m.mediaType === 'IMAGE')
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    short_description: product.shortDescription,
    price: toNumber(product.price),
    image_url: image ? resolveMediaUrl(env, image.r2Key) : '/banners/category-watercolor-art.jpg',
    product_type: productTypeFromCategory(product.categoryId),
    stock: product.stock,
    is_active: product.status === 'active',
  }
}

function mapSellerProduct(
  product: typeof products.$inferSelect,
  media: (typeof productMedia.$inferSelect)[],
  env: Env,
) {
  const images = media.filter((m) => m.mediaType === 'IMAGE').map((m) => resolveMediaUrl(env, m.r2Key))
  const video = media.find((m) => m.mediaType === 'VIDEO')
  return {
    ...mapBuyerProduct(product, media, env),
    image_urls: images,
    video_url: video ? resolveMediaUrl(env, video.r2Key) : undefined,
    updated_at: product.updatedAt.toISOString(),
  }
}

async function replaceMedia(db: Db, env: Env, productId: string, input: ProductInput) {
  const existing = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, productId),
  })
  for (const item of existing) {
    await deleteR2Object(env, item.r2Key)
  }
  await db.delete(productMedia).where(eq(productMedia.productId, productId))

  let sort = 0
  for (const url of input.image_urls) {
    const saved = await persistMediaInput(env, productId, url, 'IMAGE', sort)
    await db.insert(productMedia).values({
      productId,
      mediaType: 'IMAGE',
      fileName: saved.fileName,
      r2Key: saved.r2Key,
      sortOrder: sort,
    })
    sort += 1
  }

  if (input.video_url) {
    const saved = await persistMediaInput(env, productId, input.video_url, 'VIDEO', 0)
    await db.insert(productMedia).values({
      productId,
      mediaType: 'VIDEO',
      fileName: saved.fileName,
      r2Key: saved.r2Key,
      sortOrder: 999,
    })
  }
}

async function replaceSpecifications(
  db: Db,
  productId: string,
  specs: ProductInput['specifications'],
) {
  await db.delete(productSpecifications).where(eq(productSpecifications.productId, productId))
  if (!specs?.length) return
  await db.insert(productSpecifications).values(
    specs.map((spec, index) => ({
      productId,
      label: spec.label,
      value: spec.value,
      sortOrder: spec.sort_order ?? index,
    })),
  )
}

export async function listProducts(db: Db, env: Env, query: {
  page: number
  limit: number
  search?: string
  min_price?: number
  max_price?: number
  product_type?: string
  in_stock?: boolean
  sort?: string
  includeInactive?: boolean
}) {
  const filters = []
  if (!query.includeInactive) filters.push(eq(products.status, 'active'))
  if (query.search) {
    filters.push(
      or(
        ilike(products.name, `%${query.search}%`),
        ilike(products.description, `%${query.search}%`),
        ilike(products.shortDescription, `%${query.search}%`),
      ),
    )
  }
  if (query.product_type) filters.push(eq(products.categoryId, query.product_type))
  if (query.min_price != null) filters.push(gte(products.price, String(query.min_price)))
  if (query.max_price != null) filters.push(lte(products.price, String(query.max_price)))
  if (query.in_stock) filters.push(gte(products.stock, 1))

  const where = filters.length ? and(...filters) : undefined
  const orderBy = (() => {
    switch (query.sort) {
      case 'price_asc':
        return [asc(products.price)]
      case 'price_desc':
        return [desc(products.price)]
      case 'name_asc':
        return [asc(products.name)]
      case 'name_desc':
        return [desc(products.name)]
      default:
        return [desc(products.createdAt)]
    }
  })()

  const offset = (query.page - 1) * query.limit
  const rows = await db.query.products.findMany({
    where,
    orderBy,
    limit: query.limit,
    offset,
  })
  const [{ value: total }] = await db.select({ value: count() }).from(products).where(where)

  const mediaMap = await loadMediaMap(
    db,
    env,
    rows.map((p) => p.id),
  )

  return {
    items: rows.map((product) => mapBuyerProduct(product, mediaMap.get(product.id) ?? [], env)),
    page: query.page,
    limit: query.limit,
    total: Number(total),
    total_pages: Math.max(1, Math.ceil(Number(total) / query.limit)),
  }
}

export async function getProductById(db: Db, env: Env, id: string, includeInactive = false) {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!product) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  if (!includeInactive && product.status !== 'active') {
    throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  }
  const media = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, id),
    orderBy: [asc(productMedia.sortOrder)],
  })
  return mapBuyerProduct(product, media, env)
}

export async function getProductBySlug(db: Db, env: Env, slug: string) {
  const product = await db.query.products.findFirst({ where: eq(products.slug, slug) })
  if (!product || product.status !== 'active') {
    throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  }
  const media = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, product.id),
    orderBy: [asc(productMedia.sortOrder)],
  })
  return mapBuyerProduct(product, media, env)
}

export async function createProduct(db: Db, env: Env, input: ProductInput, createdBy?: string) {
  const slug = await uniqueSlug(db, input.name)
  const [product] = await db
    .insert(products)
    .values({
      slug,
      name: input.name,
      shortDescription: input.short_description,
      description: input.description,
      categoryId: input.product_type,
      price: String(input.price),
      compareAtPrice: input.compare_at_price != null ? String(input.compare_at_price) : null,
      stock: input.stock,
      sku: input.sku,
      status: input.is_active ? 'active' : 'draft',
      featured: input.featured ?? false,
      trending: input.trending ?? false,
      createdBy: createdBy ?? null,
    })
    .returning()

  await replaceMedia(db, env, product.id, input)
  await replaceSpecifications(db, product.id, input.specifications)

  const media = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, product.id),
    orderBy: [asc(productMedia.sortOrder)],
  })
  return mapSellerProduct(product, media, env)
}

export async function updateProduct(db: Db, env: Env, id: string, input: Partial<ProductInput>) {
  const existing = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!existing) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)

  const nextName = input.name ?? existing.name
  const slug = input.name ? await uniqueSlug(db, nextName, id) : existing.slug

  const [product] = await db
    .update(products)
    .set({
      slug,
      name: input.name ?? existing.name,
      shortDescription: input.short_description ?? existing.shortDescription,
      description: input.description ?? existing.description,
      categoryId: input.product_type ?? existing.categoryId,
      price: input.price != null ? String(input.price) : existing.price,
      compareAtPrice:
        input.compare_at_price != null ? String(input.compare_at_price) : existing.compareAtPrice,
      stock: input.stock ?? existing.stock,
      sku: input.sku ?? existing.sku,
      status:
        input.is_active == null ? existing.status : input.is_active ? 'active' : 'draft',
      featured: input.featured ?? existing.featured,
      trending: input.trending ?? existing.trending,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning()

  if (input.image_urls || input.video_url !== undefined) {
    await replaceMedia(db, env, id, {
      name: product.name,
      short_description: product.shortDescription,
      description: product.description,
      price: toNumber(product.price),
      stock: product.stock,
      product_type: product.categoryId,
      is_active: product.status === 'active',
      image_urls: input.image_urls ?? [],
      video_url: input.video_url,
    })
  }

  if (input.specifications) {
    await replaceSpecifications(db, id, input.specifications)
  }

  const media = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, id),
    orderBy: [asc(productMedia.sortOrder)],
  })
  return mapSellerProduct(product, media, env)
}

export async function deleteProduct(db: Db, env: Env, id: string) {
  const existing = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!existing) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  const media = await db.query.productMedia.findMany({ where: eq(productMedia.productId, id) })
  for (const item of media) await deleteR2Object(env, item.r2Key)
  await db.delete(products).where(eq(products.id, id))
}

export async function listSellerProducts(db: Db, env: Env) {
  const rows = await db.query.products.findMany({ orderBy: [desc(products.updatedAt)] })
  const mediaMap = await loadMediaMap(
    db,
    env,
    rows.map((p) => p.id),
  )
  return rows.map((product) => mapSellerProduct(product, mediaMap.get(product.id) ?? [], env))
}

export async function getSellerProduct(db: Db, env: Env, id: string) {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!product) throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404)
  const media = await db.query.productMedia.findMany({
    where: eq(productMedia.productId, id),
    orderBy: [asc(productMedia.sortOrder)],
  })
  return mapSellerProduct(product, media, env)
}

export async function decrementStock(db: Db, productId: string, quantity: number) {
  const result = await db
    .update(products)
    .set({
      stock: sql`${products.stock} - ${quantity}`,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), gte(products.stock, quantity)))
    .returning({ id: products.id })

  return result.length > 0
}

export async function getActiveProductsForCart(db: Db, ids: string[]) {
  if (ids.length === 0) return []
  return db.query.products.findMany({
    where: and(inArray(products.id, ids), eq(products.status, 'active')),
  })
}
