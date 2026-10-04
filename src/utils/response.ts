import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: ContentfulStatusCode = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function success<T>(c: Context, message: string, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, message, data }, status)
}

export function failure(c: Context, message: string, code: string, status: ContentfulStatusCode = 400) {
  return c.json({ success: false, message, error: { code } }, status)
}

/** Legacy/direct payloads for existing React client routes. */
export function direct<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json(data, status)
}
