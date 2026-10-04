import type { Context, Next } from 'hono'
import { AppError, failure } from '../utils/response'

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    if (error instanceof AppError) {
      return failure(c, error.message, error.code, error.status)
    }
    console.error(error)
    return failure(c, 'Internal server error', 'INTERNAL_ERROR', 500)
  }
}
