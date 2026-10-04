import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { Env } from '../types/env'
import * as schema from './schema'

export function createDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Database connection is not configured')
  }

  const client = postgres(connectionString, { prepare: false, max: 5 })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
