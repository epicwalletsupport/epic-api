import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const devVarsPath = join(root, '.dev.vars')

if (existsSync(devVarsPath)) {
  for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const result = spawnSync('wrangler', ['dev'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

process.exit(result.status ?? 1)
