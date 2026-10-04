import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orders, paymentWebhookEvents, payments } from '../db/schema'
import type { Env } from '../types/env'
import { toNumber, roundMoney } from '../utils/money'
import { AppError } from '../utils/response'

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createRazorpayOrder(db: Db, env: Env, orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) throw new AppError('Order not found', 'ORDER_NOT_FOUND', 404)

  const amountPaise = Math.round(toNumber(order.total) * 100)
  const receipt = order.orderNumber

  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: { order_id: order.id },
    }),
  })

  if (!response.ok) {
    throw new AppError('Could not create Razorpay order', 'RAZORPAY_ORDER_FAILED', 502)
  }

  const payload = (await response.json()) as { id: string }
  const [payment] = await db
    .insert(payments)
    .values({
      orderId: order.id,
      razorpayOrderId: payload.id,
      amount: order.total,
      currency: 'INR',
      status: 'pending',
    })
    .returning()

  return {
    payment_id: payment.id,
    amount: toNumber(order.total),
    currency: 'INR',
    razorpay_order_id: payload.id,
    razorpay_key_id: env.RAZORPAY_KEY_ID,
  }
}

export async function verifyRazorpayPaymentWithSecret(
  db: Db,
  env: Env,
  input: {
    order_id: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  },
) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.orderId, input.order_id) })
  if (!payment) throw new AppError('Payment not found', 'PAYMENT_NOT_FOUND', 404)

  const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`
  const expected = await hmacSha256(env.RAZORPAY_KEY_SECRET, body)
  if (input.razorpay_signature !== expected) {
    await db
      .update(payments)
      .set({ status: 'failed', failureReason: 'Signature mismatch', updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
    throw new AppError('Invalid payment signature', 'INVALID_PAYMENT_SIGNATURE', 400)
  }

  await markPaymentSuccess(db, payment.id, input.razorpay_payment_id, input.razorpay_signature)
  return { success: true }
}

async function markPaymentSuccess(
  db: Db,
  paymentId: string,
  razorpayPaymentId: string,
  signature: string,
) {
  const [payment] = await db
    .update(payments)
    .set({
      status: 'success',
      razorpayPaymentId,
      razorpaySignature: signature,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, paymentId))
    .returning()

  await db
    .update(orders)
    .set({ paymentStatus: 'success', orderStatus: 'paid', updatedAt: new Date() })
    .where(eq(orders.id, payment.orderId))
}

export async function processWebhook(db: Db, env: Env, rawBody: string, signatureHeader: string | undefined) {
  const expected = await hmacSha256(env.RAZORPAY_WEBHOOK_SECRET, rawBody)
  if (!signatureHeader || signatureHeader !== expected) {
    throw new AppError('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE', 400)
  }

  const payload = JSON.parse(rawBody) as {
    id?: string
    event?: string
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; status?: string } }
    }
  }

  const eventId = payload.id ?? crypto.randomUUID()
  const existing = await db.query.paymentWebhookEvents.findFirst({
    where: eq(paymentWebhookEvents.eventId, eventId),
  })
  if (existing?.processed) return { duplicate: true }

  if (!existing) {
    await db.insert(paymentWebhookEvents).values({
      eventId,
      eventType: payload.event ?? 'unknown',
      payload: rawBody,
      processed: 0,
    })
  }

  const paymentEntity = payload.payload?.payment?.entity
  if (paymentEntity?.order_id && paymentEntity.status === 'captured') {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.razorpayOrderId, paymentEntity.order_id),
    })
    if (payment && payment.status !== 'success') {
      await markPaymentSuccess(db, payment.id, paymentEntity.id ?? '', 'webhook')
    }
  }

  await db
    .update(paymentWebhookEvents)
    .set({ processed: 1, processedAt: new Date() })
    .where(eq(paymentWebhookEvents.eventId, eventId))

  return { duplicate: false }
}

export function buildPaymentInitResponse(
  created: Awaited<ReturnType<typeof createRazorpayOrder>>,
) {
  return {
    payment_id: created.payment_id,
    amount: roundMoney(created.amount),
    currency: created.currency,
    razorpay_order_id: created.razorpay_order_id,
    razorpay_key_id: created.razorpay_key_id,
  }
}
