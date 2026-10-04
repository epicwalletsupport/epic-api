import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { passwordResetTokens, userSessions, users } from '../db/schema'
import type { Env } from '../types/env'
import { mapUser } from '../utils/mappers'
import { hashPassword, hashToken, verifyPassword } from '../utils/password'
import { AppError } from '../utils/response'
import { createRefreshToken, createResetToken, signAccessToken } from '../utils/token'

function accessTtlMinutes(env: Env): number {
  return Number(env.ACCESS_TOKEN_TTL_MINUTES ?? 15)
}

function refreshTtlDays(env: Env): number {
  return Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30)
}

async function issueSession(db: Db, env: Env, userId: string, role: typeof users.$inferSelect.role) {
  const refreshToken = createRefreshToken()
  const refreshTokenHash = await hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + refreshTtlDays(env) * 24 * 60 * 60 * 1000)

  await db.insert(userSessions).values({
    userId,
    refreshTokenHash,
    expiresAt,
  })

  const access_token = await signAccessToken(
    { sub: userId, role },
    env.JWT_SECRET,
    accessTtlMinutes(env),
  )

  return { access_token, refresh_token: refreshToken }
}

export async function registerUser(
  db: Db,
  env: Env,
  input: { username: string; email: string; mobile: string; password: string },
) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email.toLowerCase()) })
  if (existing) throw new AppError('Email is already registered', 'EMAIL_EXISTS', 409)

  const passwordHash = await hashPassword(input.password)
  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email.toLowerCase(),
      mobile: input.mobile,
      passwordHash,
      role: 'customer',
    })
    .returning()

  const tokens = await issueSession(db, env, created.id, created.role)
  return { user: mapUser(created), ...tokens }
}

export async function loginUser(
  db: Db,
  env: Env,
  input: { email_or_mobile: string; password: string },
) {
  const identifier = input.email_or_mobile.trim().toLowerCase()
  const user = await db.query.users.findFirst({
    where: or(eq(users.email, identifier), eq(users.mobile, input.email_or_mobile.trim())),
  })
  if (!user) throw new AppError('Invalid credentials', 'INVALID_CREDENTIALS', 401)

  const valid = await verifyPassword(input.password, user.passwordHash)
  if (!valid) throw new AppError('Invalid credentials', 'INVALID_CREDENTIALS', 401)

  const tokens = await issueSession(db, env, user.id, user.role)
  return { user: mapUser(user), ...tokens }
}

export async function refreshSession(db: Db, env: Env, refreshToken: string) {
  const refreshTokenHash = await hashToken(refreshToken)
  const session = await db.query.userSessions.findFirst({
    where: and(
      eq(userSessions.refreshTokenHash, refreshTokenHash),
      isNull(userSessions.revokedAt),
      gt(userSessions.expiresAt, new Date()),
    ),
  })
  if (!session) throw new AppError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401)

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  if (!user) throw new AppError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401)

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.id, session.id))

  const tokens = await issueSession(db, env, user.id, user.role)
  return { user: mapUser(user), ...tokens }
}

export async function logoutSession(db: Db, refreshToken: string) {
  const refreshTokenHash = await hashToken(refreshToken)
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.refreshTokenHash, refreshTokenHash))
}

export async function logoutAllSessions(db: Db, userId: string) {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
}

export async function requestPasswordReset(db: Db, email: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
  if (!user) return { accepted: true as const, resetToken: null as string | null }

  const resetToken = createResetToken()
  const tokenHash = await hashToken(resetToken)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  })

  return { accepted: true as const, resetToken }
}

export async function resetPasswordWithToken(db: Db, token: string, password: string) {
  const tokenHash = await hashToken(token)
  const record = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  })
  if (!record) throw new AppError('Invalid or expired reset token', 'INVALID_RESET_TOKEN', 400)

  const passwordHash = await hashPassword(password)
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, record.userId))
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id))
  await logoutAllSessions(db, record.userId)
}

export async function legacyResetPassword(db: Db, email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
  if (!user) throw new AppError('Account not found', 'USER_NOT_FOUND', 404)
  const passwordHash = await hashPassword(password)
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id))
  await logoutAllSessions(db, user.id)
}

export async function checkEmailExists(db: Db, email: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
  return { exists: Boolean(user) }
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: { username?: string; email?: string; mobile?: string },
) {
  if (input.email) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    })
    if (existing && existing.id !== userId) {
      throw new AppError('Email is already registered', 'EMAIL_EXISTS', 409)
    }
  }

  const [updated] = await db
    .update(users)
    .set({
      username: input.username,
      email: input.email?.toLowerCase(),
      mobile: input.mobile,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning()

  return mapUser(updated)
}
