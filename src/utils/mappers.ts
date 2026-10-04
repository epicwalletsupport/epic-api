import type { users } from '../db/schema'
import type { UserRole } from '../types/env'

type DbUser = typeof users.$inferSelect

export function mapUser(user: DbUser) {
  const userType = user.role === 'seller' || user.role === 'admin' ? 'seller' : 'buyer'
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    mobile: user.mobile,
    role: userType === 'seller' ? 'SELLER' : 'BUYER',
    user_type: userType,
  } as const
}

const frontendToDbOrderStatus: Record<string, string> = {
  CONFIRMED: 'paid',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
}

const dbToFrontendOrderStatus: Record<string, string> = {
  pending: 'CONFIRMED',
  payment_pending: 'CONFIRMED',
  paid: 'CONFIRMED',
  processing: 'PROCESSING',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  failed: 'CANCELLED',
  refunded: 'CANCELLED',
}

export function toDbOrderStatus(frontendStatus: string): string {
  return frontendToDbOrderStatus[frontendStatus] ?? 'processing'
}

export function toFrontendOrderStatus(dbStatus: string): string {
  return dbToFrontendOrderStatus[dbStatus] ?? 'CONFIRMED'
}

export function toFrontendPaymentStatus(dbStatus: string): string {
  switch (dbStatus) {
    case 'success':
      return 'PAID'
    case 'failed':
      return 'FAILED'
    case 'refunded':
      return 'REFUNDED'
    default:
      return 'PENDING'
  }
}

export function categoryFromProductType(productType: string): string {
  return productType
}

export function productTypeFromCategory(categoryId: string): string {
  return categoryId
}

export function isSellerRole(role: UserRole): boolean {
  return role === 'seller' || role === 'admin'
}
