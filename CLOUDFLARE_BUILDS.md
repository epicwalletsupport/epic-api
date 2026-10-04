# Cloudflare Workers Builds (epic-api)

## Required settings

| Field | Value |
|-------|--------|
| **Root directory** | `/` if this repo is only `epic-api`; otherwise `epic-api` |
| **Build command** | *(leave empty)* |
| **Deploy command** | `npm run deploy` **recommended** |

Alternative deploy command (equivalent):

```bash
(npx wrangler r2 bucket create epic-valut || true) && npx wrangler deploy
```

> If you only run `npx wrangler deploy`, the R2 bucket must already exist in the **same Cloudflare account** as the build token (account from the build log).

## R2 bucket missing (error 10085)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → account **2e241b6ae6068873b4abc59ae1e1d13d** (or the account tied to **epic-api build token**).
2. **R2** → **Create bucket** → name **`epic-valut`** (exact spelling).
3. Enable **R2** on the account if prompted.
4. Redeploy.

Ensure the build token has **Account → R2 → Edit** (or Admin) permissions.

## Worker secrets (epic-api)

`DATABASE_URL`, `JWT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

## API URL

After deploy: `https://epic-api.<your-subdomain>.workers.dev`

Update Razorpay webhook and frontend `VITE_API_URL` to match.
