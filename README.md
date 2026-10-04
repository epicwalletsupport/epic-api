# epic-api

Production backend for the painting e-commerce app, built with **Cloudflare Workers**, **Hono**, **TypeScript**, **Neon PostgreSQL**, **Drizzle ORM**, **Hyperdrive**, **Cloudflare R2**, and **Razorpay**.

## Stack

- Runtime: Cloudflare Workers
- API: Hono + Zod validation
- Database: Neon PostgreSQL via Hyperdrive (`postgres` + Drizzle)
- Media: Cloudflare R2 (`PRODUCT_MEDIA_BUCKET`)
- Payments: Razorpay Orders + webhook verification

## Project layout

```text
src/
  index.ts
  routes/
  services/
  db/
  middleware/
  validators/
  utils/
```

Routes are mounted at both `/` and `/api` so the React app can use `VITE_API_URL=http://127.0.0.1:8787` without an `/api` prefix, while spec-style paths like `/api/auth/login` also work.

## Setup

1. Copy `.dev.vars.example` to `.dev.vars` and fill secrets.
2. Create a Neon database and set `DATABASE_URL`.
3. Set Worker secret `DATABASE_URL` to your Neon connection string (Cloudflare dashboard or `wrangler secret put DATABASE_URL`).
4. Create / bind R2 bucket `epic-valut` (see `wrangler.jsonc`).
5. Optional: add [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) later and bind `HYPERDRIVE` in `wrangler.jsonc` for connection pooling.
6. Apply schema:

```bash
npm run db:push
```

7. Seed the single seller/admin account:

```bash
npm run db:seed:seller
```

8. Start locally:

```bash
npm run dev
```

## Frontend integration

Set in `epic-web`:

```env
VITE_API_URL=http://127.0.0.1:8787
```

Implemented endpoints used by the React client include:

- Auth: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/profile`, `/auth/logout`, forgot-password check/reset
- Catalog: `/products`, `/products/:id`
- Cart validation: `/cart/validate`
- Orders: `/orders`, `/orders/:id`
- Payments: `/payments/initiate`, plus `/payments/create-order`, `/payments/verify`, `/payments/webhook`
- Seller: `/seller/dashboard/stats`, `/seller/products`, `/seller/orders`

Admin equivalents live under `/admin/orders`.

## Security notes

- Passwords stored as PBKDF2 hashes only
- Refresh tokens stored hashed in `user_sessions`
- Reset tokens stored hashed in `password_reset_tokens`
- Order line prices and stock are always computed server-side
- Razorpay signatures verified on `/payments/verify` and webhook handler
- Webhook events deduplicated with `payment_webhook_events.event_id`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Worker via Wrangler |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Generate SQL migrations |
| `npm run db:push` | Push schema to Neon |
| `npm run db:seed:seller` | Seed seller user |
