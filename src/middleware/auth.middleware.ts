import type { Context, Next } from 'hono'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { AppVariables, Env, UserRole } from '../types/env'
import { AppError } from '../utils/response'
import { verifyAccessToken } from '../utils/token'

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Unauthorized', 'UNAUTHORIZED', 401)
  }
  const token = header.slice('Bearer '.length)
  const payload = await verifyAccessToken(token, c.env.JWT_SECRET)
  c.set('userId', payload.userId)
  c.set('userRole', payload.role)
  await next()
}

export async function optionalAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next,
) {
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = await verifyAccessToken(header.slice(7), c.env.JWT_SECRET)
      c.set('userId', payload.userId)
      c.set('userRole', payload.role)
    } catch {
      // ignore invalid token for optional auth
    }
  }
  await next()
}

export function requireRoles(...roles: UserRole[]) {
  return async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
    const role = c.get('userRole')
    if (!role || !roles.includes(role)) {
      throw new AppError('Forbidden', 'FORBIDDEN', 403)
    }
    await next()
  }
}

export async function loadUserOrFail(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
) {
  const userId = c.get('userId')
  if (!userId) throw new AppError('Unauthorized', 'UNAUTHORIZED', 401)
  const db = createDb(c.env)
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new AppError('Unauthorized', 'UNAUTHORIZED', 401)
  return user
}
