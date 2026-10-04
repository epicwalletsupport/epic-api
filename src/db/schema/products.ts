import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const productStatusEnum = pgEnum('product_status', ['active', 'draft', 'archived'])
export const mediaTypeEnum = pgEnum('media_type', ['IMAGE', 'VIDEO'])

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  shortDescription: text('short_description').notNull().default(''),
  description: text('description').notNull().default(''),
  categoryId: varchar('category_id', { length: 64 }).notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  compareAtPrice: numeric('compare_at_price', { precision: 12, scale: 2 }),
  stock: integer('stock').notNull().default(0),
  sku: varchar('sku', { length: 64 }),
  status: productStatusEnum('status').notNull().default('draft'),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default('0'),
  reviewCount: integer('review_count').notNull().default(0),
  featured: boolean('featured').notNull().default(false),
  trending: boolean('trending').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productMedia = pgTable('product_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  mediaType: mediaTypeEnum('media_type').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  r2Key: text('r2_key').notNull(),
  alt: varchar('alt', { length: 255 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSpecifications = pgTable('product_specifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 120 }).notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})
