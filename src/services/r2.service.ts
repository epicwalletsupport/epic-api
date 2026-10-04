import type { Env } from '../types/env'
import { AppError } from '../utils/response'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function parseDataUrl(value: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(value)
  if (!match) return null
  const mime = match[1]
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mime, bytes }
}

function extensionForMime(mime: string): string {
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  return 'bin'
}

export function resolveMediaUrl(env: Env, keyOrUrl: string): string {
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://') || keyOrUrl.startsWith('data:')) {
    return keyOrUrl
  }
  if (keyOrUrl.startsWith('/')) return keyOrUrl
  const base = env.R2_PUBLIC_URL?.replace(/\/$/, '')
  return base ? `${base}/${keyOrUrl}` : keyOrUrl
}

export async function persistMediaInput(
  env: Env,
  productId: string,
  input: string,
  kind: 'IMAGE' | 'VIDEO',
  sortOrder: number,
): Promise<{ r2Key: string; fileName: string; url: string }> {
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/')) {
    return {
      r2Key: input,
      fileName: input.split('/').pop() ?? 'external',
      url: input,
    }
  }

  const parsed = parseDataUrl(input)
  if (!parsed) {
    throw new AppError('Invalid media payload', 'INVALID_MEDIA', 400)
  }

  const maxBytes = kind === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (parsed.bytes.byteLength > maxBytes) {
    throw new AppError('Media file is too large', 'MEDIA_TOO_LARGE', 400)
  }

  const ext = extensionForMime(parsed.mime)
  const fileName = kind === 'VIDEO' ? `demo.${ext}` : `gallery-${String(sortOrder).padStart(2, '0')}.${ext}`
  const r2Key = `products/${productId}/${fileName}`

  await env.PRODUCT_MEDIA_BUCKET.put(r2Key, parsed.bytes, {
    httpMetadata: { contentType: parsed.mime },
  })

  return { r2Key, fileName, url: resolveMediaUrl(env, r2Key) }
}

export async function deleteR2Object(env: Env, key: string) {
  if (!key.startsWith('products/')) return
  await env.PRODUCT_MEDIA_BUCKET.delete(key)
}
