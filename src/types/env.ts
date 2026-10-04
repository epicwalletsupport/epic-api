export type UserRole = 'customer' | 'seller' | 'admin'

export interface Env {
  HYPERDRIVE: Hyperdrive
  PRODUCT_MEDIA_BUCKET: R2Bucket
  DATABASE_URL?: string
  JWT_SECRET: string
  RAZORPAY_KEY_ID: string
  RAZORPAY_KEY_SECRET: string
  RAZORPAY_WEBHOOK_SECRET: string
  R2_PUBLIC_URL: string
  ACCESS_TOKEN_TTL_MINUTES?: string
  REFRESH_TOKEN_TTL_DAYS?: string
}

export type AppVariables = {
  userId?: string
  userRole?: UserRole
}
