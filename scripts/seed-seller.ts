/**
 * Run with: DATABASE_URL=... npx tsx scripts/seed-seller.ts
 */
import postgres from 'postgres'
import { hashPassword } from '../src/utils/password'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const email = process.env.SEED_SELLER_EMAIL ?? 'seller@epic.local'
  const password = process.env.SEED_SELLER_PASSWORD ?? 'Seller@12345'
  const username = process.env.SEED_SELLER_USERNAME ?? 'Epic Seller'
  const mobile = process.env.SEED_SELLER_MOBILE ?? '9876543210'

  const passwordHash = await hashPassword(password)
  const sql = postgres(databaseUrl, { max: 1 })

  await sql`
    INSERT INTO users (username, email, mobile, password_hash, role)
    VALUES (${username}, ${email}, ${mobile}, ${passwordHash}, 'seller')
    ON CONFLICT (email) DO UPDATE
    SET username = EXCLUDED.username,
        mobile = EXCLUDED.mobile,
        password_hash = EXCLUDED.password_hash,
        role = 'seller',
        updated_at = NOW()
  `

  console.log(`Seeded seller account: ${email}`)
  await sql.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
