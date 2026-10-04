import { spawnSync } from 'node:child_process'

const BUCKET = 'epic-valut'

function wrangler(args, { allowFailure = false } = {}) {
  const result = spawnSync('wrangler', args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1)
  }
}

// Idempotent: succeeds if the bucket already exists in this Cloudflare account.
wrangler(['r2', 'bucket', 'create', BUCKET], { allowFailure: true })
wrangler(['deploy'])
