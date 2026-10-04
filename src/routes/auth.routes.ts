import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createDb } from '../db/client'
import {
  checkEmailExists,
  legacyResetPassword,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
} from '../services/auth.service'
import { authMiddleware, loadUserOrFail } from '../middleware/auth.middleware'
import type { AppVariables, Env } from '../types/env'
import { mapUser } from '../utils/mappers'
import { direct, success } from '../utils/response'
import {
  forgotPasswordSchema,
  legacyResetPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.schema'

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const db = createDb(c.env)
  const result = await registerUser(db, c.env, c.req.valid('json'))
  return direct(c, { user: result.user, access_token: result.access_token })
})

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = createDb(c.env)
  const result = await loginUser(db, c.env, c.req.valid('json'))
  return direct(c, { user: result.user, access_token: result.access_token })
})

authRoutes.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const db = createDb(c.env)
  const result = await refreshSession(db, c.env, c.req.valid('json').refresh_token)
  return success(c, 'Token refreshed', {
    user: result.user,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  })
})

authRoutes.post('/logout', authMiddleware, async (c) => {
  const db = createDb(c.env)
  const body = (await c.req.json<{ refresh_token?: string }>().catch(() => ({}))) as {
    refresh_token?: string
  }
  if (body.refresh_token) {
    await logoutSession(db, body.refresh_token)
  }
  return direct(c, { success: true })
})

authRoutes.post('/logout-all', authMiddleware, async (c) => {
  const user = await loadUserOrFail(c)
  const db = createDb(c.env)
  await logoutAllSessions(db, user.id)
  return success(c, 'Logged out from all devices', null)
})

authRoutes.post('/forgot-password', zValidator('json', forgotPasswordSchema), async (c) => {
  const db = createDb(c.env)
  const { email } = c.req.valid('json')
  const result = await requestPasswordReset(db, email)
  return success(c, 'If the account exists, reset instructions were sent', {
    // Returned only for development/testing without email provider.
    reset_token: result.resetToken,
  })
})

authRoutes.post('/reset-password', zValidator('json', resetPasswordSchema), async (c) => {
  const db = createDb(c.env)
  const body = c.req.valid('json')
  await resetPasswordWithToken(db, body.token, body.password)
  return success(c, 'Password reset successfully', null)
})

authRoutes.post('/forgot-password/check', zValidator('json', forgotPasswordSchema), async (c) => {
  const db = createDb(c.env)
  const result = await checkEmailExists(db, c.req.valid('json').email)
  return direct(c, result)
})

authRoutes.post('/forgot-password/reset', zValidator('json', legacyResetPasswordSchema), async (c) => {
  const db = createDb(c.env)
  const body = c.req.valid('json')
  await legacyResetPassword(db, body.email, body.password)
  return direct(c, { success: true })
})

authRoutes.get('/me', authMiddleware, async (c) => {
  const user = await loadUserOrFail(c)
  return direct(c, mapUser(user))
})

authRoutes.put('/profile', authMiddleware, zValidator('json', profileUpdateSchema), async (c) => {
  const user = await loadUserOrFail(c)
  const db = createDb(c.env)
  const updated = await updateProfile(db, user.id, c.req.valid('json'))
  return direct(c, updated)
})
