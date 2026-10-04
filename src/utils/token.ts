import { SignJWT, jwtVerify } from 'jose'
import type { UserRole } from '../types/env'

function secretKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function signAccessToken(
  payload: { sub: string; role: UserRole },
  secret: string,
  ttlMinutes: number,
): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlMinutes}m`)
    .sign(secretKey(secret))
}

export async function verifyAccessToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, secretKey(secret))
  const sub = payload.sub
  const role = payload.role
  if (!sub || typeof sub !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { userId: sub, role: role as UserRole }
}

export function createRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function createResetToken(): string {
  return createRefreshToken()
}
