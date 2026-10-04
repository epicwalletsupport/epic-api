import { z } from 'zod'

export const registerSchema = z.object({
  username: z.string().min(2).max(120),
  email: z.string().email(),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  email_or_mobile: z.string().min(3).max(255),
  password: z.string().min(1).max(128),
})

export const refreshSchema = z.object({
  refresh_token: z.string().min(10),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
})

export const legacyResetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export const profileUpdateSchema = z.object({
  username: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^[6-9]\d{9}$/).optional(),
})
