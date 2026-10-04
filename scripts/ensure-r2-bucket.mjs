import { spawnSync } from 'node:child_process'

const BUCKET = 'epic-valut'

const isCloudflareBuild =
  Boolean(process.env.CF_ACCOUNT_ID) ||
  Boolean(process.env.CLOUDFLARE_API_TOKEN) ||
  process.env.CI === 'true' ||
  (process.cwd() || '').includes('buildhome')

if (!isCloudflareBuild) {
  process.exit(0)
}

console.log(`[ensure-r2-bucket] Ensuring R2 bucket "${BUCKET}" in Cloudflare build…`)

spawnSync('npx', ['wrangler', 'r2', 'bucket', 'create', BUCKET], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

// Never fail npm install; deploy will error clearly if the bucket is still missing.
process.exit(0)
